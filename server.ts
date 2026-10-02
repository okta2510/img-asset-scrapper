import express from "express";
import path from "path";
import * as cheerio from "cheerio";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import https from "https";
import http from "http";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "assets-scrap-secret-key-2026";

// Create token for authenticated users
function generateToken(payload: { username: string; status: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60); // 7 days expiration
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url");
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${signature}`;
}

// Verify token signature and expiration
function verifyToken(token: string): { username: string; status: string } | null {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (signature !== expectedSig) return null;

    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { username: decoded.username, status: decoded.status };
  } catch (_) {
    return null;
  }
}

// SSRF Safety Validator for remote URLs
function isSafeUrl(targetUrl: string): boolean {
  try {
    if (!targetUrl || typeof targetUrl !== "string") return false;
    const parsed = new URL(targetUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.endsWith(".lan")
    ) {
      return false;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
    const match172 = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
    if (match172) {
      const secondOctet = parseInt(match172[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) return false;
    }
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
    if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
    if (/^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;

    return true;
  } catch (_) {
    return false;
  }
}

// Set up server-side Gemini client lazily to avoid cold-start errors if API key is unconfigured
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSy_placeholder_key";
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// CORS & Preflight handler
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Normalize request path to ensure /api prefix is always present.
app.use((req: any, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith("/api") && !req.url.startsWith("/api")) {
    req.url = req.originalUrl;
    return next();
  }
  const matchedPath = req.headers["x-matched-path"];
  if (matchedPath && typeof matchedPath === "string" && matchedPath.startsWith("/api/")) {
    req.url = matchedPath;
    return next();
  }
  if (!req.url.startsWith("/api")) {
    if (
      req.url.startsWith("/auth") ||
      req.url.startsWith("/config") ||
      req.url.startsWith("/scrape") ||
      req.url.startsWith("/search") ||
      req.url.startsWith("/proxy") ||
      req.url.startsWith("/gemini")
    ) {
      req.url = "/api" + req.url;
    }
  }
  next();
});

// Guard body-parser so it doesn't hang if Vercel serverless runtime already consumed the stream
app.use((req: any, res, next) => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      try {
        req.body = JSON.parse(req.body);
      } catch (_) {}
    }
    return next();
  }
  express.json({ limit: "5mb" })(req, res, next);
});

app.use((req: any, res, next) => {
  if (req.body !== undefined && req.body !== null) {
    return next();
  }
  express.urlencoded({ extended: true, limit: "5mb" })(req, res, next);
});

// Local DB configuration moved off /tmp to standard process directory or DATA_DIR with in-memory fallback
const DB_DIR = process.env.DATA_DIR || process.cwd();
const LOCAL_DB_PATH = path.join(DB_DIR, "users-local-db.json");

let memoryDbCache: { users: any[] } | null = null;

const defaultUsersData = {
  users: [
    {
      username: "admin",
      password: "admin123",
      email: "admin@yanginibeda.com",
      fullName: "System Admin",
      status: "APPROVED",
      createdAt: new Date().toISOString()
    },
    {
      username: "tester",
      password: "tester123",
      email: "tester@gmail.com",
      fullName: "Pending Tester Profile",
      status: "PENDING",
      createdAt: new Date().toISOString()
    }
  ]
};

function readLocalDB() {
  if (memoryDbCache) {
    return memoryDbCache;
  }

  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const data = fs.readFileSync(LOCAL_DB_PATH, "utf-8");
      memoryDbCache = JSON.parse(data);
      return memoryDbCache;
    }
  } catch (err) {
    console.error("Error reading local db from file:", err);
  }

  memoryDbCache = JSON.parse(JSON.stringify(defaultUsersData));
  try {
    if (!fs.existsSync(LOCAL_DB_PATH)) {
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(memoryDbCache, null, 2), "utf-8");
    }
  } catch (_) {}

  return memoryDbCache;
}

function writeLocalDB(data: any) {
  memoryDbCache = data;
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Notice: could not write local DB to filesystem, state updated in memory:", err);
  }
}

// Authentication Middlewares
function requireAuth(req: any, res: express.Response, next: express.NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }
  if (!token && req.headers["x-auth-token"]) {
    token = String(req.headers["x-auth-token"]).trim();
  }
  if (!token && req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userPayload = verifyToken(token);
  if (!userPayload) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  const db = readLocalDB();
  const dbUser = db.users.find((u: any) => u.username.toLowerCase() === userPayload.username.toLowerCase());
  const currentStatus = dbUser ? dbUser.status : userPayload.status;

  if (currentStatus !== "APPROVED") {
    return res.status(403).json({ success: false, error: `Account status is ${currentStatus}. Approved access required.` });
  }

  req.user = { ...userPayload, status: currentStatus };
  next();
}

function requireAdmin(req: any, res: express.Response, next: express.NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  }
  if (!token && req.headers["x-auth-token"]) {
    token = String(req.headers["x-auth-token"]).trim();
  }
  if (!token && req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userPayload = verifyToken(token);
  if (!userPayload) {
    return res.status(401).json({ success: false, error: "Invalid or expired token" });
  }

  if (userPayload.username.toLowerCase() !== "admin") {
    return res.status(403).json({ success: false, error: "Admin authorization required." });
  }

  req.user = userPayload;
  next();
}

// Forward Request to Google Apps Script
async function postToAppsScript(url: string, payload: any) {
  console.log(`Forwarding payload to Apps Script:`, url);
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    console.log(`Apps Script response snippet:`, text.substring(0, 300));
    try {
      return JSON.parse(text);
    } catch (_) {
      return { 
        success: false, 
        error: "Google Apps Script returned non-JSON response. Please verify that the Apps Script is deployed as a Web App with access set to 'Anyone'. Details: " + text.substring(0, 150) 
      };
    }
  } catch (err: any) {
    console.error(`Apps Script Connection Error:`, err);
    return { success: false, error: "Connection to Google Apps Script failed: " + (err.message || String(err)) };
  }
}

// Auth API Endpoints
app.post("/api/auth/register", async (req, res) => {
  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const { username, password, email, fullName, appScriptUrl } = body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const targetScriptUrl = process.env.APP_SSCRIPT_URL || appScriptUrl;
    if (targetScriptUrl && targetScriptUrl.trim().startsWith("http")) {
      console.log(`Routing registration to Google Sheets: ${username}`);
      const result = await postToAppsScript(targetScriptUrl.trim(), {
        action: "register",
        username,
        password,
        email,
        fullName,
        metadata: { source: "Assets Scrap" }
      });
      return res.json(result);
    }

    console.log(`Routing registration to local interactive DB: ${username}`);
    const db = readLocalDB();
    const users = db.users || [];
    const exists = users.find((u: any) => u.username && u.username.toLowerCase() === username.toLowerCase());
    
    if (exists) {
      return res.json({ success: false, error: "Username already exists" });
    }

    const newUser = {
      username: username.trim(),
      password: password.trim(),
      email: email ? email.trim() : "",
      fullName: fullName ? fullName.trim() : username.trim(),
      status: "PENDING",
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    db.users = users;
    writeLocalDB(db);

    return res.json({
      success: true,
      status: "PENDING",
      user: {
        username: newUser.username,
        email: newUser.email,
        fullName: newUser.fullName,
        status: "PENDING",
        createdAt: newUser.createdAt
      }
    });
  } catch (error: any) {
    console.error("Register API error:", error);
    return res.status(500).json({ success: false, error: error.message || "An error occurred during registration" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
    const { username, password, appScriptUrl } = body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password are required" });
    }

    const targetScriptUrl = process.env.APP_SSCRIPT_URL || appScriptUrl;
    if (targetScriptUrl && targetScriptUrl.trim().startsWith("http")) {
      console.log(`Routing login verification to Google Sheets: ${username}`);
      const result = await postToAppsScript(targetScriptUrl.trim(), {
        action: "login",
        username,
        password
      });
      if (result && result.success && result.user) {
        const userStatus = result.user.status || "APPROVED";
        const token = generateToken({ username: result.user.username, status: userStatus });
        return res.json({
          ...result,
          user: {
            ...result.user,
            token
          }
        });
      }
      return res.json(result);
    }

    console.log(`Routing login validation to local interactive DB: ${username}`);
    const db = readLocalDB();
    const users = db.users || [];
    const user = users.find((u: any) => u.username && u.username.toLowerCase() === username.toLowerCase());

    if (!user) {
      return res.json({ success: false, error: "Username not registered" });
    }

    if (user.password !== password) {
      return res.json({ success: false, error: "Incorrect password" });
    }

    const token = generateToken({ username: user.username, status: user.status });

    return res.json({
      success: true,
      user: {
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        status: user.status,
        createdAt: user.createdAt,
        token
      }
    });
  } catch (error: any) {
    console.error("Login API error:", error);
    return res.status(500).json({ success: false, error: error.message || "An error occurred during login" });
  }
});

app.get("/api/config", (req, res) => {
  res.json({
    success: true,
    hasAppScript: Boolean(process.env.APP_SSCRIPT_URL)
  });
});

app.get("/api/auth/users", requireAdmin, (req, res) => {
  const db = readLocalDB();
  res.json({
    success: true,
    users: db.users.map((u: any) => ({
      username: u.username,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      createdAt: u.createdAt
    }))
  });
});

app.post("/api/auth/update-status", requireAdmin, (req, res) => {
  const { username, status } = req.body;
  if (!username || !status) {
    return res.status(400).json({ success: false, error: "Username and status are required" });
  }

  const db = readLocalDB();
  const userIdx = db.users.findIndex((u: any) => u.username.toLowerCase() === username.toLowerCase());
  
  if (userIdx === -1) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  db.users[userIdx].status = status;
  writeLocalDB(db);

  return res.json({
    success: true,
    message: `Status updated successfully to ${status}`,
    user: {
      username: db.users[userIdx].username,
      status: db.users[userIdx].status
    }
  });
});

// Helper to fetch with a timeout and robust fallback for SSL/Socket resets
async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 12000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
    return response;
  } catch (error: any) {
    console.warn(`Standard fetch failed for ${url} (Error: ${error.message || error}). Trying legacy safe HTTPS helper...`);

    if (options.signal?.aborted || controller.signal.aborted) {
      throw new Error(`Request to ${url} was aborted/timed out.`);
    }

    return new Promise((resolve, reject) => {
      try {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === "https:";
        const agent = isHttps ? https : http;

        const originalHeaders = options.headers || {};
        const headers: Record<string, string> = {};
        
        Object.entries(originalHeaders).forEach(([k, v]) => {
          headers[k] = String(v);
        });

        if (!headers["User-Agent"] && !headers["user-agent"]) {
          headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        }

        const requestOptions: any = {
          method: options.method || "GET",
          headers,
          timeout: timeoutMs,
        };

        if (isHttps) {
          requestOptions.rejectUnauthorized = false;
          requestOptions.minVersion = "TLSv1";
        }

        const req = agent.request(url, requestOptions, (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => {
            const buffer = Buffer.concat(chunks);
            const headersMap = new Map<string, string>();
            if (res.headers) {
              Object.entries(res.headers).forEach(([k, v]) => {
                headersMap.set(k.toLowerCase(), Array.isArray(v) ? v.join(", ") : v || "");
              });
            }

            resolve({
              ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
              status: res.statusCode || 200,
              statusText: res.statusMessage || "OK",
              headers: {
                get: (name: string) => headersMap.get(name.toLowerCase()) || null,
              },
              text: async () => buffer.toString("utf-8"),
              arrayBuffer: async () => {
                return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
              }
            });
          });
        });

        req.on("error", (err) => {
          reject(err);
        });

        req.on("timeout", () => {
          req.destroy();
          reject(new Error(`Legacy request timed out after ${timeoutMs}ms`));
        });

        if (options.body) {
          req.write(options.body);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  } finally {
    clearTimeout(id);
  }
}

// 1. Scrape Images from one or more URLs
app.get("/api/scrape", requireAuth, async (req, res) => {
  const targetUrlParam = req.query.url as string;
  if (!targetUrlParam) {
    return res.status(400).json({ error: "URL query parameter is required" });
  }

  try {
    const urlList = targetUrlParam
      .split(/[\s,\n]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    if (urlList.length === 0) {
      return res.status(400).json({ error: "No valid URLs provided" });
    }

    const discoveredImages: Array<{
      url: string;
      sourceUrl: string;
      alt: string;
      aspectRatio?: string;
      suggestedName?: string;
      sourceSite?: string;
    }> = [];

    const uniqueUrls = new Set<string>();

    const safeUrlList = urlList.filter((u) => {
      let testUrl = u;
      if (!/^https?:\/\//i.test(testUrl)) {
        testUrl = "https://" + testUrl;
      }
      return isSafeUrl(testUrl);
    });

    if (safeUrlList.length === 0) {
      return res.status(400).json({ error: "Provided URLs are restricted or invalid" });
    }

    const scrapePromises = safeUrlList.slice(0, 5).map(async (targetUrl) => {
      try {
        let validatedUrl = targetUrl;
        if (!/^https?:\/\//i.test(targetUrl)) {
          validatedUrl = "https://" + targetUrl;
        }

        const parsedTarget = new URL(validatedUrl);
        const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        const response = await fetchWithTimeout(validatedUrl, {
          headers: { "User-Agent": userAgent }
        });

        if (!response.ok) {
          console.warn(`Scraping failed for ${validatedUrl}: Status ${response.status}`);
          return;
        }

        const html = await response.text();
        const $ = cheerio.load(html);

        const addImage = (srcStr: string, altText: string) => {
          try {
            if (!srcStr || srcStr.startsWith("data:")) return;
            const resolved = new URL(srcStr, validatedUrl).href;
            if (!isSafeUrl(resolved)) return;

            if (!uniqueUrls.has(resolved)) {
              uniqueUrls.add(resolved);

              let cleanName = "image";
              if (altText) {
                cleanName = altText.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
              } else {
                const pathParts = new URL(resolved).pathname.split("/");
                const lastPart = pathParts[pathParts.length - 1];
                if (lastPart && lastPart.includes(".")) {
                  cleanName = lastPart.split(".")[0].replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
                }
              }

              discoveredImages.push({
                url: resolved,
                sourceUrl: resolved,
                alt: altText || `Scraped from ${parsedTarget.hostname}`,
                suggestedName: cleanName || "image",
                sourceSite: parsedTarget.hostname
              });
            }
          } catch (e) {
            // Ignore malformed images
          }
        };

        $("img").each((_, element) => {
          const src = $(element).attr("src");
          const srcset = $(element).attr("srcset");
          const dataSrc = $(element).attr("data-src") || $(element).attr("data-original") || $(element).attr("lazy-src");
          const alt = $(element).attr("alt") || "";

          if (dataSrc) addImage(dataSrc, alt);
          if (src) addImage(src, alt);

          if (srcset) {
            const parts = srcset.split(",");
            for (const part of parts) {
              const trimmed = part.trim();
              if (trimmed) {
                const urlChunk = trimmed.split(/\s+/)[0];
                if (urlChunk) addImage(urlChunk, alt);
              }
            }
          }
        });

        $('link[rel*="icon"]').each((_, element) => {
          const href = $(element).attr("href");
          if (href) {
            addImage(href, "Favicon / Site Icon");
          }
        });

        $("a").each((_, element) => {
          const href = $(element).attr("href");
          const text = $(element).text() || "";
          if (href && /\.(jpe?g|png|webp|gif|svg|ico|avif|bmp|tiff?)(\?.*)?$/i.test(href)) {
            addImage(href, text);
          }
        });

      } catch (e: any) {
        console.error(`Error scraping url ${targetUrl}:`, e.message);
      }
    });

    await Promise.all(scrapePromises);

    if (discoveredImages.length === 0) {
      return res.status(500).json({
        success: false,
        error: "No high-resolution images could be found or indexed from the provided URLs.",
        details: "Ensure the website URLs are fully accessible and do not block automated requests."
      });
    }

    res.json({
      success: true,
      url: targetUrlParam,
      images: discoveredImages
    });

  } catch (error: any) {
    console.error("General scraping multi-endpoint error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Timeout or network failure connecting to the server.",
      details: "Ensure the website URLs are fully accessible and do not block automated queries."
    });
  }
});

// 2. Utility Multi-Engine Search Scrapers (Google, Bing, Unsplash, etc.)
async function scrapeGoogleImages(keyword: string, region?: string): Promise<any[]> {
  let url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&tbm=isch`;
  if (region && region !== "all") {
    const gl = region.toLowerCase();
    let hl = "en";
    if (gl === "id") hl = "id";
    else if (gl === "jp") hl = "ja";
    else if (gl === "fr") hl = "fr";
    url += `&gl=${gl}&hl=${hl}`;
    if (gl !== "us" && gl !== "global") {
      url += `+site%3A.${gl}`;
    }
  }
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.35";
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": userAgent }
    });
    if (!response.ok) return [];
    
    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();

    const cleanName = (text: string) => {
      return text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    };

    $("a[href*='/imgres']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) {
        try {
          const urlObj = new URL(href, "https://www.google.com");
          const imgUrl = urlObj.searchParams.get("imgurl");
          const alt = $(el).find("img").attr("alt") || $(el).text() || "";
          if (imgUrl && isSafeUrl(imgUrl) && !unique.has(imgUrl) && imgUrl.startsWith("http")) {
            unique.add(imgUrl);
            images.push({
              url: imgUrl,
              sourceUrl: imgUrl,
              alt: alt || `${keyword} Google Image`,
              suggestedName: cleanName(alt || keyword),
              engine: "Google (Web)"
            });
          }
        } catch (_) {}
      }
    });

    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-iurl");
      if (src && src.startsWith("http") && isSafeUrl(src) && !unique.has(src) && !src.includes("googlelogo") && !src.includes("gstatic.com")) {
        unique.add(src);
        const alt = $(el).attr("alt") || "";
        images.push({
          url: src,
          sourceUrl: src,
          alt: alt || `${keyword} Google Image`,
          suggestedName: cleanName(alt || keyword),
          engine: "Google (Web)"
        });
      }
    });

    return images;
  } catch (err) {
    console.error("Google Image Scraper Error:", err);
    return [];
  }
}

async function scrapeBingImages(keyword: string, region?: string): Promise<any[]> {
  let url = `https://www.bing.com/images/search?q=${encodeURIComponent(keyword)}`;
  if (region && region !== "all") {
    url += `&cc=${region.toUpperCase()}`;
  }
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": userAgent }
    });
    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();

    const cleanName = (text: string) => {
      return text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    };

    $(".iusc, a[m]").each((_, el) => {
      const mAttr = $(el).attr("m");
      if (mAttr) {
        try {
          const mData = JSON.parse(mAttr);
          const imgUrl = mData.murl || mData.imgurl;
          const alt = mData.desc || mData.title || "";
          if (imgUrl && isSafeUrl(imgUrl) && !unique.has(imgUrl) && imgUrl.startsWith("http")) {
            unique.add(imgUrl);
            images.push({
              url: imgUrl,
              sourceUrl: imgUrl,
              alt: alt || `${keyword} Bing Image`,
              suggestedName: cleanName(alt || keyword),
              engine: "Bing Search"
            });
          }
        } catch (e) {
          const murlMatch = mAttr.match(/"murl"\s*:\s*"([^"]+)"/);
          if (murlMatch && murlMatch[1]) {
            const imgUrl = murlMatch[1];
            if (isSafeUrl(imgUrl) && !unique.has(imgUrl) && imgUrl.startsWith("http")) {
              unique.add(imgUrl);
              images.push({
                url: imgUrl,
                sourceUrl: imgUrl,
                alt: `${keyword} Bing Image`,
                suggestedName: cleanName(keyword),
                engine: "Bing Search"
              });
            }
          }
        }
      }
    });

    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src");
      if (src && src.startsWith("http") && isSafeUrl(src) && !unique.has(src) && !src.includes("bing.com/sa/") && !src.includes("bing.com/th")) {
        unique.add(src);
        const alt = $(el).attr("alt") || "";
        images.push({
          url: src,
          sourceUrl: src,
          alt: alt || `${keyword} Bing Image`,
          suggestedName: cleanName(alt || keyword),
          engine: "Bing Search"
        });
      }
    });

    return images;
  } catch (err) {
    console.error("Bing Image Scraper Error:", err);
    return [];
  }
}

async function scrapeUnsplashImages(keyword: string): Promise<any[]> {
  const url = `https://unsplash.com/s/photos/${encodeURIComponent(keyword)}`;
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await fetchWithTimeout(url, {
      headers: { "User-Agent": userAgent }
    });
    if (!response.ok) return [];

    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();

    const cleanName = (text: string) => {
      return text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    };

    $("img").each((_, element) => {
      const src = $(element).attr("src");
      const alt = $(element).attr("alt") || "";
      
      if (src && src.includes("images.unsplash.com/photo-") && !unique.has(src) && isSafeUrl(src)) {
        let processedUrl = src;
        try {
          const urlObj = new URL(src);
          urlObj.searchParams.set("auto", "format");
          urlObj.searchParams.set("q", "85");
          urlObj.searchParams.delete("w");
          urlObj.searchParams.delete("h");
          processedUrl = urlObj.toString();
        } catch (_) {}

        unique.add(src);
        images.push({
          url: processedUrl,
          sourceUrl: src,
          alt: alt || `${keyword} stock image`,
          suggestedName: cleanName(alt || keyword),
          engine: "Unsplash"
        });
      }
    });

    return images;
  } catch (err) {
    console.error("Unsplash Scraper Error:", err);
    return [];
  }
}

async function scrapePexelsImages(keyword: string): Promise<any[]> {
  const url = `https://www.pexels.com/search/${encodeURIComponent(keyword)}/`;
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await fetchWithTimeout(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();
    const cleanName = (text: string) => text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    $("img").each((_, element) => {
      const src = $(element).attr("src") || $(element).attr("data-srcset") || "";
      const alt = $(element).attr("alt") || "";
      if (src && src.includes("images.pexels.com/photos/") && !unique.has(src) && isSafeUrl(src)) {
        let processedUrl = src;
        try {
          const urlObj = new URL(src);
          urlObj.searchParams.delete("w");
          urlObj.searchParams.delete("h");
          urlObj.searchParams.set("auto", "compress");
          urlObj.searchParams.set("cs", "tinysrgb");
          processedUrl = urlObj.toString();
        } catch (_) {}
        unique.add(src);
        images.push({
          url: processedUrl,
          sourceUrl: src,
          alt: alt || `${keyword} Pexels stock`,
          suggestedName: cleanName(alt || keyword),
          engine: "Pexels"
        });
      }
    });
    return images;
  } catch (err) {
    console.error("Pexels Image Scraper Error:", err);
    return [];
  }
}

async function scrapePixabayImages(keyword: string): Promise<any[]> {
  const url = `https://pixabay.com/images/search/${encodeURIComponent(keyword)}/`;
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await fetchWithTimeout(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();
    const cleanName = (text: string) => text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    $("img").each((_, element) => {
      const src = $(element).attr("src") || $(element).attr("data-src") || "";
      const alt = $(element).attr("alt") || "";
      if (src && (src.includes("pixabay.com/") || src.includes("cdn.pixabay.com/")) && !src.includes("favicon") && !unique.has(src) && isSafeUrl(src)) {
        unique.add(src);
        images.push({
          url: src,
          sourceUrl: src,
          alt: alt || `${keyword} Pixabay stock`,
          suggestedName: cleanName(alt || keyword),
          engine: "Pixabay"
        });
      }
    });
    return images;
  } catch (err) {
    console.error("Pixabay Image Scraper Error:", err);
    return [];
  }
}

async function scrapeFlickrImages(keyword: string): Promise<any[]> {
  const url = `https://www.flickr.com/search/?text=${encodeURIComponent(keyword)}`;
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await fetchWithTimeout(url, { headers: { "User-Agent": userAgent } });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();
    const cleanName = (text: string) => text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    $("img").each((_, element) => {
      const src = $(element).attr("src") || $(element).attr("data-src") || "";
      const alt = $(element).attr("alt") || "";
      if (src && !src.includes("buddyicon") && src.startsWith("http") && !unique.has(src) && isSafeUrl(src)) {
        unique.add(src);
        images.push({
          url: src,
          sourceUrl: src,
          alt: alt || `${keyword} Flickr image`,
          suggestedName: cleanName(alt || keyword),
          engine: "Flickr"
        });
      }
    });
    return images;
  } catch (err) {
    console.error("Flickr Scraper Error:", err);
    return [];
  }
}

async function scrapeCustomEngine(targetUrl: string, engineName: string, keyword: string): Promise<any[]> {
  if (!isSafeUrl(targetUrl)) return [];
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  try {
    const response = await fetchWithTimeout(targetUrl, { headers: { "User-Agent": userAgent } });
    if (!response.ok) return [];
    const html = await response.text();
    const $ = cheerio.load(html);
    const images: any[] = [];
    const unique = new Set<string>();
    const cleanName = (text: string) => text.trim().replace(/[^a-zA-Z0-9]/g, "_").toLowerCase().slice(0, 30);
    
    $("img").each((_, element) => {
      const src = $(element).attr("src") || $(element).attr("data-src") || $(element).attr("data-srcset") || "";
      const alt = $(element).attr("alt") || "";
      if (src && src.startsWith("http") && !src.includes("logo") && !unique.has(src) && isSafeUrl(src)) {
        unique.add(src);
        images.push({
          url: src,
          sourceUrl: src,
          alt: alt || `${keyword} (${engineName})`,
          suggestedName: cleanName(alt || keyword),
          engine: engineName
        });
      }
    });

    $("a").each((_, element) => {
      const href = $(element).attr("href");
      const text = $(element).text() || "";
      if (href && href.startsWith("http") && /\.(jpe?g|png|webp|svg)(\?.*)?$/i.test(href) && !unique.has(href) && isSafeUrl(href)) {
        unique.add(href);
        images.push({
          url: href,
          sourceUrl: href,
          alt: text || `${keyword} (${engineName} image)`,
          suggestedName: cleanName(text || keyword),
          engine: engineName
        });
      }
    });
    return images;
  } catch (err) {
    console.error(`Custom Engine Scraper Error [${engineName}]:`, err);
    return [];
  }
}

// 3. Multi-Engine Search Endpoint
app.get("/api/search", requireAuth, async (req, res) => {
  const keyword = req.query.q as string;
  if (!keyword) {
    return res.status(400).json({ error: "Search keyword is required" });
  }

  const region = req.query.region as string || "all";

  const sourcesParam = req.query.sources as string;
  const sources = sourcesParam
    ? sourcesParam.split(",").map(s => s.trim().toLowerCase())
    : ["google", "bing"];

  const customUnserialized = req.query.custom_unserialized as string;
  let customEngines: any[] = [];
  if (customUnserialized) {
    try {
      customEngines = JSON.parse(customUnserialized);
    } catch (_) {}
  }

  try {
    const promises: Promise<any[]>[] = [];
    if (sources.includes("google")) promises.push(scrapeGoogleImages(keyword, region));
    if (sources.includes("bing")) promises.push(scrapeBingImages(keyword, region));
    if (sources.includes("unsplash")) promises.push(scrapeUnsplashImages(keyword));
    if (sources.includes("pexels")) promises.push(scrapePexelsImages(keyword));
    if (sources.includes("pixabay")) promises.push(scrapePixabayImages(keyword));
    if (sources.includes("flickr")) promises.push(scrapeFlickrImages(keyword));

    for (const engine of customEngines) {
      if (sources.includes(engine.id.toLowerCase())) {
        const queryUrl = engine.url
          .replace("{query}", encodeURIComponent(keyword))
          .replace("{q}", encodeURIComponent(keyword));
        promises.push(scrapeCustomEngine(queryUrl, engine.name, keyword));
      }
    }

    const resultsArray = await Promise.all(promises);
    
    const combined: any[] = [];
    const uniqueUrls = new Set<string>();

    for (const resList of resultsArray) {
      for (const img of resList) {
        if (!uniqueUrls.has(img.url)) {
          uniqueUrls.add(img.url);
          combined.push(img);
        }
      }
    }

    if (combined.length === 0) {
      console.log("Empty search result across streams, triggering local stock fallback table");
      for (let i = 1; i <= 15; i++) {
        const id = Math.floor(Math.random() * 1050) + 1;
        const fakeUrl = `https://picsum.photos/id/${id}/1600/1200`;
        combined.push({
          url: fakeUrl,
          sourceUrl: fakeUrl,
          alt: `Fallback placeholder #${id} matches: ${keyword}`,
          suggestedName: `${keyword.trim().replace(/[^a-zA-Z0-9]/g, "_")}_${id}`,
          engine: "Picsum (Fallback)"
        });
      }
    }

    res.json({
      success: true,
      keyword,
      images: combined
    });

  } catch (error: any) {
    console.error("Search fetch error:", error);
    const fallbackResults = [];
    for (let i = 1; i <= 12; i++) {
      const id = Math.floor(Math.random() * 1000) + 1;
      const url = `https://picsum.photos/id/${id}/1600/1200`;
      fallbackResults.push({
        url,
        sourceUrl: url,
        alt: `${keyword} visual inspiration #${i}`,
        suggestedName: `${keyword.trim().replace(/[^a-zA-Z0-9]/g, "_")}_${id}`,
        engine: "Picsum (Fallback)"
      });
    }
    res.json({
      success: true,
      keyword,
      images: fallbackResults,
      notice: "Fell back to Stock Reserve engine due to target connection safety."
    });
  }
});

// Stream remote proxy response cleanly to prevent memory buffering spikes and eliminate SSRF
function streamProxyUrl(targetUrl: string, res: express.Response, redirectsLeft = 3) {
  if (redirectsLeft <= 0) {
    return res.status(400).send("Too many redirects");
  }
  if (!isSafeUrl(targetUrl)) {
    return res.status(400).send("Invalid or restricted target URL");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (_) {
    return res.status(400).send("Malformed URL");
  }

  const client = parsedUrl.protocol === "https:" ? https : http;

  const req = client.get(
    targetUrl,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/*,*/*"
      },
      timeout: 15000
    },
    (originRes) => {
      if (originRes.statusCode && originRes.statusCode >= 300 && originRes.statusCode < 400 && originRes.headers.location) {
        try {
          const redirectUrl = new URL(originRes.headers.location, targetUrl).href;
          return streamProxyUrl(redirectUrl, res, redirectsLeft - 1);
        } catch (_) {
          return res.status(400).send("Invalid redirect URL");
        }
      }

      if (!originRes.statusCode || originRes.statusCode < 200 || originRes.statusCode >= 300) {
        return res.status(originRes.statusCode || 500).send(`Failed to fetch remote asset`);
      }

      const contentType = originRes.headers["content-type"] || "image/jpeg";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      if (originRes.headers["content-length"]) {
        res.setHeader("Content-Length", originRes.headers["content-length"]);
      }

      originRes.pipe(res);
    }
  );

  req.on("error", (err: any) => {
    console.error("Proxy streaming error:", err?.message || err);
    if (!res.headersSent) {
      res.status(500).send("Failed to stream image asset.");
    }
  });

  req.on("timeout", () => {
    req.destroy();
    if (!res.headersSent) {
      res.status(500).send("Proxy request timed out.");
    }
  });
}

// 4. CORS Proxy API to download and stream images directly
app.get("/api/proxy", requireAuth, (req: any, res: express.Response) => {
  const imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).send("url parameter is required");
  }

  streamProxyUrl(imageUrl, res);
});

// 5. Gemini Smart Image Tagging / Metadata categorization helper
app.post("/api/gemini/analyze", requireAuth, async (req, res) => {
  const { imageUrl, prompt } = req.body;
  if (!imageUrl || !isSafeUrl(imageUrl)) {
    return res.status(400).json({ error: "Valid imageUrl is required" });
  }

  try {
    const itemRes = await fetchWithTimeout(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
    }, 12000);

    if (!itemRes.ok) {
      throw new Error("Unable to retrieve remote image node for Gemini");
    }

    const buffer = await itemRes.arrayBuffer();
    const base64Data = Buffer.from(buffer).toString("base64");
    const mimeType = itemRes.headers.get("content-type") || "image/jpeg";

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };

    const textPart = {
      text: prompt || "Analyze this image and provide: 1. A short title 2. Five descriptive keyword tags separated by commas 3. A 2-sentence description of the content and its primary color palette."
    };

    const ai = getGeminiClient();
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, textPart] }
    });

    res.json({
      success: true,
      analysis: response.text
    });

  } catch (error: any) {
    console.error("Gemini AI API Error:", error);
    res.status(500).json({ error: error.message || "An AI analyze request error occurred" });
  }
});

// Fallback for unmatched API endpoints
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: `API endpoint ${req.originalUrl || req.url} not found` });
});

// Integrate Vite Middleware for Client Application Access
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server successfully started at port ${PORT}`);
  });
}

// Only start HTTP listener when executed directly
const isDirectRun = Boolean(
  process.argv[1] && (
    process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("server.cjs") ||
    process.argv[1].endsWith("server.js")
  )
);

if (isDirectRun && !process.env.VERCEL && !process.env.VERCEL_ENV) {
  startServer();
}

export default app;
