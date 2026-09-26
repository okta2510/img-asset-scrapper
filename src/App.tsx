import React, { useState, useEffect } from "react";
import { 
  Globe, Search, SlidersHorizontal, Image as ImageIcon, Download, 
  Trash2, Loader2, Sparkles, Filter, CheckSquare, Square, RefreshCcw, 
  Settings, ArrowUpDown, ChevronLeft, ChevronRight, HelpCircle, HardDrive, Crop, Eye, Sparkle,
  Copy, Check, Plus, Lock, User, Mail, ShieldAlert, Key, LogOut, ExternalLink, FileSpreadsheet, UserCheck, Shield,
  Link, ClipboardCopy
} from "lucide-react";
import JSZip from "jszip";

import { ScrapedImage, ScrapeHistoryItem, CustomEngine } from "./types";
import { getProxiedUrl, triggerFileDownload, extractFormatFromUrl, copyImageToClipboard } from "./utils/imageEditor";
import HistoryPanel from "./components/HistoryPanel";
import GeminiAnalyzeModal from "./components/GeminiAnalyzeModal";
import ImageCropperModal from "./components/ImageCropperModal";

export default function App() {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<"scrape" | "search">("scrape");
  
  // Search state
  const [crawlUrl, setCrawlUrl] = useState("");
  const [searchWord, setSearchWord] = useState("");
  const [searchSources, setSearchSources] = useState<Record<string, boolean>>({
    google: true,
    bing: true,
    unsplash: false,
    pexels: false,
    pixabay: false,
    flickr: false
  });
  const [customEngines, setCustomEngines] = useState<CustomEngine[]>(() => {
    try {
      const saved = localStorage.getItem("imgrap_custom_engines");
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return [];
  });
  const [showAddEngine, setShowAddEngine] = useState(false);
  const [customEngineName, setCustomEngineName] = useState("");
  const [customEngineUrl, setCustomEngineUrl] = useState("");
  const [customEngineDesc, setCustomEngineDesc] = useState("");

  useEffect(() => {
    localStorage.setItem("imgrap_custom_engines", JSON.stringify(customEngines));
  }, [customEngines]);

  const [images, setImages] = useState<ScrapedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Authentication & Google Sheets integration states
  const [currentUser, setCurrentUser] = useState<any>(() => {
    try {
      const saved = localStorage.getItem("imgrap_logged_user");
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return null;
  });

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [regSuccessMsg, setRegSuccessMsg] = useState<string | null>(null);

  // Simulated users for development controls
  const [simulatedUsers, setSimulatedUsers] = useState<any[]>([]);
  const [showSimulatedControls, setShowSimulatedControls] = useState(false);
  const [showAppscriptGuide, setShowAppscriptGuide] = useState(false);

  const [hasServerAppScript, setHasServerAppScript] = useState(false);

  // Fetch app script configuration status from server
  useEffect(() => {
    // Purge any stale client-side stored script url for security
    try {
      localStorage.removeItem("imgrap_app_script_url");
    } catch (_) {}

    fetch("/api/config")
      .then((res) => res.json())
      .then((data) => {
        if (data?.hasAppScript) {
          setHasServerAppScript(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("imgrap_logged_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("imgrap_logged_user");
    }
  }, [currentUser]);

  const fetchSimulatedUsers = async () => {
    try {
      const res = await fetch("/api/auth/users");
      const data = await res.json();
      if (data.success) {
        setSimulatedUsers(data.users);
      }
    } catch (e) {
      console.warn("Could not fetch simulated users list", e);
    }
  };

  useEffect(() => {
    if (!currentUser || currentUser.status === "PENDING" || showSimulatedControls) {
      fetchSimulatedUsers();
    }
  }, [currentUser, showSimulatedControls]);

  const handleUpdateSimulatedStatus = async (username: string, newStatus: string) => {
    try {
      const res = await fetch("/api/auth/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        fetchSimulatedUsers();
        if (currentUser && currentUser.username.toLowerCase() === username.toLowerCase()) {
          setCurrentUser((prev: any) => ({ ...prev, status: newStatus }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAuthLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Username and password are required.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        setAuthPassword("");
      } else {
        setAuthError(data.error || "Login Verification failed.");
      }
    } catch (error: any) {
      setAuthError("Could not connect to authentication portal: " + error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUsername.trim() || !authPassword.trim()) {
      setAuthError("Username and password are required.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setRegSuccessMsg(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUsername.trim(),
          password: authPassword.trim(),
          email: authEmail.trim(),
          fullName: authFullName.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setRegSuccessMsg(`Success! Account "${authUsername.trim()}" successfully registered.`);
        setAuthMode("login");
        setAuthPassword("");
        setAuthEmail("");
        setAuthFullName("");
        fetchSimulatedUsers();
      } else {
        setAuthError(data.error || "Registration failed. Username might already be taken.");
      }
    } catch (error: any) {
      setAuthError("Network error occurred during registration: " + error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem("imgrap_logged_user");
  };

  const appsScriptCode = `// 1. Open Google Sheets (https://docs.google.com/spreadsheets/d/1aFaGZ6KicIAZ07wihcLTmoMI4YnlyMxRo1l9vzVFRus/edit)
// 2. Click "Extensions" -> "Apps Script" at the top menu.
// 3. Paste the following code into Code.gs, replacing any existing content.
// 4. Click "Deploy" -> "New Deployment" (Gear icon -> "Web App").
// 5. Select: Execute as "Me", Who has access: "Anyone".
// 6. Copy the Web App URL and paste it into the "Apps Script URL" field in this app!

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Using the requested Google Sheet
    var SPREADSHEET_ID = "1aFaGZ6KicIAZ07wihcLTmoMI4YnlyMxRo1l9vzVFRus";
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("users");
    
    if (!sheet) {
      sheet = ss.insertSheet("users");
      // Append schema header
      sheet.appendRow(["username", "password", "email", "fullName", "status", "createdAt", "metadata"]);
    }
    
    var action = data.action;
    
    if (action === "register") {
      var username = String(data.username || "").trim();
      var password = String(data.password || "").trim();
      var email = String(data.email || "").trim();
      var fullName = String(data.fullName || "").trim();
      
      if (!username || !password) {
        return createResponse({ success: false, error: "Username and password can not be empty" });
      }
      
      // Duplication check
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var range = sheet.getRange(2, 1, lastRow - 1, 1);
        var usernames = range.getValues().map(function(r) { return String(r[0]).toLowerCase(); });
        if (usernames.indexOf(username.toLowerCase()) !== -1) {
          return createResponse({ success: false, error: "Username already exists in sheet" });
        }
      }
      
      // Add record with status PENDING as requested
      sheet.appendRow([username, password, email, fullName, "PENDING", new Date().toISOString(), JSON.stringify(data.metadata || {})]);
      
      return createResponse({ success: true, status: "PENDING" });
    }
    
    if (action === "login") {
      var username = String(data.username || "").trim().toLowerCase();
      var password = String(data.password || "").trim();
      
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        // Get all usernames, passwords, and info
        var records = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
        for (var i = 0; i < records.length; i++) {
          var sheetUser = String(records[i][0]).trim();
          var sheetPass = String(records[i][1]).trim();
          var sheetEmail = String(records[i][2]).trim();
          var sheetFullName = String(records[i][3]).trim();
          var sheetStatus = String(records[i][4]).trim();
          var sheetCred = String(records[i][5]).trim();
          
          if (sheetUser.toLowerCase() === username) {
            if (sheetPass === password) {
              return createResponse({
                success: true,
                user: {
                  username: sheetUser,
                  email: sheetEmail,
                  fullName: sheetFullName || sheetUser,
                  status: sheetStatus || "APPROVED",
                  createdAt: sheetCred
                }
              });
            } else {
              return createResponse({ success: false, error: "Incorrect password" });
            }
          }
        }
      }
      return createResponse({ success: false, error: "Username not registered in sheet" });
    }
    
    return createResponse({ success: false, error: "Unknown action parameter" });
    
  } catch (err) {
    return createResponse({ success: false, error: "Apps Script Error: " + err.message });
  }
}

function doGet(e) {
  return createResponse({ status: "online", msg: "Google Sheet apps script connected!" });
}

function createResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}`;
  
  // History
  const [history, setHistory] = useState<ScrapeHistoryItem[]>([]);
  
  // Filters state
  const [minDimension, setMinDimension] = useState<"all" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl">("all");
  const [selectedFormat, setSelectedFormat] = useState<"all" | "jpeg" | "png" | "webp" | "svg" | "ico" | "gif" | "other">("all");
  const [gallerySearch, setGallerySearch] = useState("");
  const [sortBy, setSortBy] = useState<"none" | "dimension" | "name">("none");
  const [aspectRatioFilter, setAspectRatioFilter] = useState<"all" | "landscape" | "portrait" | "square">("all");
  const [targetRegion, setTargetRegion] = useState<"all" | "US" | "ID" | "JP" | "GB" | "FR">("all");

  // Items per page / display count limit (50 / 100 / 200 / 500 / all)
  const [itemsPerPage, setItemsPerPage] = useState<number | "all">(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Selection states (for bulk download)
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [isZipping, setIsZipping] = useState(false);
  const [zippingProgress, setZippingProgress] = useState("");

  // Modals active state
  const [cropperTarget, setCropperTarget] = useState<ScrapedImage | null>(null);
  const [aiTarget, setAiTarget] = useState<ScrapedImage | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [copiedImageId, setCopiedImageId] = useState<string | null>(null);
  const [copyingImageId, setCopyingImageId] = useState<string | null>(null);

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => {
        setCopiedUrl(null);
      }, 1500);
    }).catch((err) => {
      console.error("Failed to copy image link:", err);
    });
  };

  const handleCopyImage = async (imageUrl: string) => {
    try {
      setCopyingImageId(imageUrl);
      await copyImageToClipboard(imageUrl);
      setCopiedImageId(imageUrl);
      setTimeout(() => {
        setCopiedImageId(null);
      }, 2000);
    } catch (err: any) {
      console.error("Failed to copy image to clipboard:", err);
      alert(`Could not copy image to clipboard: ${err.message || "Security or format limitation"}`);
    } finally {
      setCopyingImageId(null);
    }
  };

  const handleAddCustomEngine = () => {
    if (!customEngineName.trim() || !customEngineUrl.trim()) return;
    
    let formattedUrl = customEngineUrl.trim();
    if (!formattedUrl.includes("{query}") && !formattedUrl.includes("{q}")) {
      if (formattedUrl.includes("?")) {
        formattedUrl += "&q={query}";
      } else {
        formattedUrl += "?q={query}";
      }
    }
    
    const engineId = "custom_" + customEngineName.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
    const newEngine: CustomEngine = {
      id: engineId,
      name: customEngineName.trim(),
      url: formattedUrl,
      desc: customEngineDesc.trim() || "User-Defined Search Engine"
    };

    setCustomEngines(prev => [...prev, newEngine]);
    setSearchSources(prev => ({ ...prev, [engineId]: true }));
    
    setCustomEngineName("");
    setCustomEngineUrl("");
    setCustomEngineDesc("");
    setShowAddEngine(false);
  };

  const handleRemoveCustomEngine = (id: string) => {
    setCustomEngines(prev => prev.filter(e => e.id !== id));
    setSearchSources(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  // Creative reassurance loader quotes
  const loadingQuotes = [
    "Crawling page links and resolving assets...",
    "Scanning HTML structures for high-res nodes...",
    "Retrieving imagery streams and bypassing server blocks...",
    "Translating responsive srcsets to absolute resolution URLs...",
    "Sorting stock reserve caches..."
  ];

  // Load history from localStorage on mounting
  useEffect(() => {
    try {
      const saved = localStorage.getItem("pic_scrape_history_logs");
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (_) {}
  }, []);

  // Sync history state with localStorage
  const saveHistoryLogs = (updated: ScrapeHistoryItem[]) => {
    setHistory(updated);
    try {
      localStorage.setItem("pic_scrape_history_logs", JSON.stringify(updated));
    } catch (_) {}
  };

  // Append new event to database/history logs
  const appendHistoryItem = (query: string, count: number, type: "scrape" | "search") => {
    // If same query already exists in history, filter it out to avoid duplication
    const cleanHistory = history.filter(h => h.query.toLowerCase() !== query.toLowerCase());
    
    const newItem: ScrapeHistoryItem = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type,
      query,
      imageCount: count
    };

    const nextLogs = [newItem, ...cleanHistory].slice(0, 40); // keep up to 40 items
    saveHistoryLogs(nextLogs);
  };

  const handleClearHistory = () => {
    confirm("Are you sure you want to clear all local history logs? This action cannot be undone.") && saveHistoryLogs([]);
  };

  const handleDeleteHistoryItem = (id: string) => {
    saveHistoryLogs(history.filter(item => item.id !== id));
  };

  // Quick select an item from local logs to instantly recheck images
  const handleSelectHistoryItem = (item: ScrapeHistoryItem) => {
    setActiveTab(item.type);
    if (item.type === "scrape") {
      setCrawlUrl(item.query);
      triggerScraping(item.query);
    } else {
      setSearchWord(item.query);
      triggerSearch(item.query);
    }
  };

  // Perform Asynchronous dimensions polling to display Width x Height on the fly!
  const probeImageResolutions = (scrapedItems: ScrapedImage[]) => {
    scrapedItems.forEach((img, idx) => {
      // Create a lightweight off-screen image constructor
      const tempImg = new Image();
      tempImg.crossOrigin = "anonymous";
      
      tempImg.onload = () => {
        setImages(prev => prev.map((item, pIdx) => {
          if (pIdx === idx) {
            return {
              ...item,
              width: tempImg.naturalWidth,
              height: tempImg.naturalHeight,
              format: extractFormatFromUrl(img.url)
            };
          }
          return item;
        }));
      };
      
      tempImg.onerror = () => {
        // Fallback default
        setImages(prev => prev.map((item, pIdx) => {
          if (pIdx === idx) {
            return {
              ...item,
              width: 800,
              height: 600,
              format: extractFormatFromUrl(img.url)
            };
          }
          return item;
        }));
      };

      // Load via CORS-bypassing proxy to guarantee image pixel reading!
      tempImg.src = getProxiedUrl(img.url);
    });
  };

  // Scraping handler
  const triggerScraping = async (target: string = crawlUrl) => {
    if (!target) return;
    setLoading(true);
    setErrorMsg(null);
    setImages([]);
    setSelectedUrls(new Set());
    
    // Cycle loading phrases
    let quoteIndex = 0;
    setLoadingMsg(loadingQuotes[0]);
    const quoteTimer = setInterval(() => {
      quoteIndex = (quoteIndex + 1) % loadingQuotes.length;
      setLoadingMsg(loadingQuotes[quoteIndex]);
    }, 2800);

    try {
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(target)}`);
      clearInterval(quoteTimer);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server responded with issue status ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.images) {
        setImages(data.images);
        appendHistoryItem(data.url, data.images.length, "scrape");
        // Trigger non-blocking async dimension scanner
        probeImageResolutions(data.images);
      } else {
        throw new Error(data.error || "Scraping completed but no high-resolution media nodes could be indexed.");
      }
    } catch (e: any) {
      clearInterval(quoteTimer);
      setErrorMsg(e.message || "Scraping timeout. Ensure target page is active and public.");
    } finally {
      setLoading(false);
    }
  };

  // Keyword stock-photo search handler
  const triggerSearch = async (kw: string = searchWord) => {
    if (!kw) return;
    setLoading(true);
    setErrorMsg(null);
    setImages([]);
    setSelectedUrls(new Set());

    // Cycle quote loaders
    let quoteIndex = 0;
    setLoadingMsg(loadingQuotes[quoteIndex]);
    const quoteTimer = setInterval(() => {
      quoteIndex = (quoteIndex + 1) % loadingQuotes.length;
      setLoadingMsg(loadingQuotes[quoteIndex]);
    }, 2500);

    try {
      const activeEngines = Object.entries(searchSources)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name)
        .join(",");
      const response = await fetch(`/api/search?q=${encodeURIComponent(kw)}&sources=${encodeURIComponent(activeEngines)}&region=${encodeURIComponent(targetRegion)}&custom_unserialized=${encodeURIComponent(JSON.stringify(customEngines))}`);
      clearInterval(quoteTimer);

      if (!response.ok) {
        throw new Error(`Catalog engine responded with error status ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.images) {
        setImages(data.images);
        appendHistoryItem(kw, data.images.length, "search");
        // Probe exact sizes securely
        probeImageResolutions(data.images);
      } else {
        throw new Error("No photo archives matched this search query.");
      }
    } catch (e: any) {
      clearInterval(quoteTimer);
      setErrorMsg(e.message || "Query failed. Retrying in fallback registry.");
    } finally {
      setLoading(false);
    }
  };

  // Selection toggles
  const handleToggleSelect = (url: string) => {
    const next = new Set(selectedUrls);
    if (next.has(url)) {
      next.delete(url);
    } else {
      next.add(url);
    }
    setSelectedUrls(next);
  };

  const handleSelectAll = (filteredImages: ScrapedImage[]) => {
    const next = new Set(selectedUrls);
    const allFilteredSelected = filteredImages.every(img => selectedUrls.has(img.url));
    
    if (allFilteredSelected) {
      // Deselect all filtered
      filteredImages.forEach(img => next.delete(img.url));
    } else {
      // Select all filtered
      filteredImages.forEach(img => next.add(img.url));
    }
    setSelectedUrls(next);
  };

  // ZIP Bulk Download Processing
  const handleBulkDownload = async (itemsToDownload: ScrapedImage[]) => {
    if (itemsToDownload.length === 0) return;
    setIsZipping(true);
    setZippingProgress("Initializing ZIP archive structure...");

    try {
      const zip = new JSZip();
      let downloadedCount = 0;

      for (let i = 0; i < itemsToDownload.length; i++) {
        const item = itemsToDownload[i];
        setZippingProgress(`Fetching and packing image ${i + 1}/${itemsToDownload.length}: ${item.suggestedName}`);

        try {
          // Absolute fetching with proxy bypasses CORS completely!
          const imgResponse = await fetch(getProxiedUrl(item.url), {
            signal: AbortSignal.timeout(10000) // 10s individual image timeout
          });

          if (!imgResponse.ok) {
            console.error(`Skipping image index ${i}: CORS error or timeout`);
            continue;
          }

          const blob = await imgResponse.blob();
          const format = item.format || "jpg";
          const finalFilename = `${item.suggestedName || `photo_${i}`}_${Date.now()}_${i}.${format}`;

          zip.file(finalFilename, blob);
          downloadedCount++;
        } catch (individualError) {
          console.error(`Skipped image index ${i} due to connection error`, individualError);
        }
      }

      if (downloadedCount === 0) {
        throw new Error("All image downloads timed out or failed bypass verification.");
      }

      setZippingProgress("Compressing image assets... Building ZIP archive...");
      const zipBlob = await zip.generateAsync({ type: "blob" });
      
      const fileStem = activeTab === "scrape" ? "scraped_site_images" : `search_images_${searchWord}`;
      triggerFileDownload(zipBlob, `${fileStem}_archive.zip`);
    } catch (e: any) {
      alert(`Bulk export failed: ${e.message || "Timeout. Ensure safe proxy connectivity."}`);
    } finally {
      setIsZipping(false);
      setZippingProgress("");
    }
  };

  // Direct single download (full raw image bypass proxy)
  const handleSingleSave = async (img: ScrapedImage) => {
    try {
      const res = await fetch(getProxiedUrl(img.url));
      if (!res.ok) throw new Error("Proxy error");
      const blob = await res.blob();
      const fmt = img.format || "jpg";
      triggerFileDownload(blob, `${img.suggestedName}.${fmt}`);
    } catch (_) {
      // Fallback redirect
      window.open(img.url, "_blank");
    }
  };

  // Client Filter logic
  const filteredImages = images.filter((img) => {
    // Sizing/Dimension limits (xs, sm, md, lg, xl, xxl, all)
    if (minDimension !== "all" && img.width && img.height) {
      const sizeRating = Math.max(img.width, img.height);
      if (minDimension === "xs" && sizeRating >= 300) return false;
      if (minDimension === "sm" && (sizeRating < 300 || sizeRating >= 600)) return false;
      if (minDimension === "md" && (sizeRating < 600 || sizeRating >= 900)) return false;
      if (minDimension === "lg" && (sizeRating < 900 || sizeRating >= 1200)) return false;
      if (minDimension === "xl" && (sizeRating < 1200 || sizeRating >= 1920)) return false;
      if (minDimension === "xxl" && sizeRating < 1920) return false;
    }

    // Aspect Ratio filter
    if (aspectRatioFilter !== "all" && img.width && img.height) {
      const ratio = img.width / img.height;
      if (aspectRatioFilter === "landscape" && ratio <= 1.1) return false;
      if (aspectRatioFilter === "portrait" && ratio >= 0.9) return false;
      if (aspectRatioFilter === "square" && (ratio < 0.9 || ratio > 1.1)) return false;
    }

    // Format / Document Signature
    if (selectedFormat !== "all") {
      const fmt = (img.format || extractFormatFromUrl(img.url)).toLowerCase();
      if (selectedFormat === "jpeg") {
        if (fmt !== "jpeg" && fmt !== "jpg") return false;
      } else if (selectedFormat === "png") {
        if (fmt !== "png") return false;
      } else if (selectedFormat === "webp") {
        if (fmt !== "webp") return false;
      } else if (selectedFormat === "svg") {
        if (fmt !== "svg") return false;
      } else if (selectedFormat === "ico") {
        const isIco = fmt === "ico" || img.url.toLowerCase().includes(".ico") || img.url.toLowerCase().includes("favicon");
        if (!isIco) return false;
      } else if (selectedFormat === "gif") {
        if (fmt !== "gif" && !img.url.toLowerCase().includes(".gif")) return false;
      } else if (selectedFormat === "other") {
        const standard = new Set(["jpeg", "jpg", "png", "webp", "svg", "ico"]);
        const isIco = fmt === "ico" || img.url.toLowerCase().includes(".ico") || img.url.toLowerCase().includes("favicon");
        if (standard.has(fmt) || isIco) return false;
      } else {
        if (fmt !== (selectedFormat as string).toLowerCase()) return false;
      }
    }

    // Keyword search in title/alt
    if (gallerySearch.trim()) {
      const searchLower = gallerySearch.toLowerCase();
      const altMatch = img.alt?.toLowerCase().includes(searchLower);
      const nameMatch = img.suggestedName?.toLowerCase().includes(searchLower);
      const urlMatch = img.url?.toLowerCase().includes(searchLower);
      return altMatch || nameMatch || urlMatch;
    }

    return true;
  });

  // Client Sort logic
  const sortedImages = [...filteredImages].sort((a, b) => {
    if (sortBy === "dimension" && a.width && b.width && a.height && b.height) {
      return (b.width * b.height) - (a.width * a.height); // descending
    }
    if (sortBy === "name") {
      return a.suggestedName.localeCompare(b.suggestedName);
    }
    return 0;
  });

  // Pagination & items showing calculation (50 / 100 / 200 / 500 / all)
  const totalItems = sortedImages.length;
  const totalPages = itemsPerPage === "all" ? 1 : Math.max(1, Math.ceil(totalItems / (typeof itemsPerPage === "number" ? itemsPerPage : 50)));
  const effectivePage = Math.min(Math.max(1, currentPage), totalPages);
  const pageSize = typeof itemsPerPage === "number" ? itemsPerPage : totalItems;
  const startIndex = itemsPerPage === "all" ? 0 : (effectivePage - 1) * pageSize;
  const endIndex = itemsPerPage === "all" ? totalItems : Math.min(startIndex + pageSize, totalItems);
  const displayedImages = itemsPerPage === "all" ? sortedImages : sortedImages.slice(startIndex, endIndex);

  useEffect(() => {
    setCurrentPage(1);
  }, [minDimension, selectedFormat, aspectRatioFilter, targetRegion, gallerySearch, sortBy, itemsPerPage]);

  // Preset query tests to let users play with the app instantly
  const testPreQueries = {
    wikipedia: "en.wikipedia.org/wiki/Portal:Arts",
    cyberpunk: "cyberpunk city neon rain",
    nature: "misty forest mountains sunrise"
  };

  // If not logged in OR status is not APPROVED, return the Auth/Register Gated portal
  if (!currentUser || currentUser.status !== "APPROVED") {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-800 font-sans tracking-tight flex flex-col items-center justify-center p-4 md:p-8 relative overflow-x-hidden selection:bg-indigo-600 selection:text-white">
        {/* Real-time geometric line background accents */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none opacity-50" />
        
        <div className="w-full max-w-lg relative z-10 space-y-6">
          
          {/* Logo & Branding */}
          <div className="text-center space-y-2">
            <div className="inline-flex w-12 h-12 rounded-2xl items-center justify-center p-1.5 bg-white border border-slate-200 shadow-md">
              <img src="/yib.svg" alt="Asset Scrap Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Asset Scrap - Solusi Digital Pengelolaan Aset Bekas dan Scrap
            </h1>
            <p className="text-xs text-slate-500 font-medium max-w-md mx-auto">
              Platform pengelolaan aset tidak terpakai, barang bekas, dan scrap industri secara mudah, transparan, dan efisien.
            </p>
          </div>

          {regSuccessMsg && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-start gap-2.5 shadow-sm">
              <UserCheck className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{regSuccessMsg}</p>
                <p className="mt-1 text-[11px] opacity-90">All new registrations default to <span className="underline font-bold">PENDING</span> status. It must be approved in the Google Sheet database before logging in.</p>
              </div>
            </div>
          )}

          {/* Core Sign-In / Register Form Box */}
          {!currentUser ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-md space-y-6">
              <div className="flex border-b border-slate-100 pb-4">
                <button
                  onClick={() => { setAuthMode("login"); setAuthError(null); }}
                  className={`flex-1 pb-2 text-center text-sm font-bold border-b-2 transition-all ${
                    authMode === "login"
                      ? "border-indigo-600 text-indigo-600 font-bold"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => { setAuthMode("register"); setAuthError(null); }}
                  className={`flex-1 pb-2 text-center text-sm font-bold border-b-2 transition-all ${
                    authMode === "register"
                      ? "border-indigo-600 text-indigo-600 font-bold"
                      : "border-transparent text-slate-400 hover:text-slate-600"
                  }`}
                >
                  Register Account
                </button>
              </div>

              {authError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={authMode === "login" ? handleAuthLogin : handleAuthRegister} className="space-y-4">
                {authMode === "register" && (
                  <>
                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-1">Full Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="John Doe"
                          value={authFullName}
                          onChange={(e) => setAuthFullName(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-1">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          placeholder="johndoe@example.com"
                          value={authEmail}
                          onChange={(e) => setAuthEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-1">Username</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Enter username"
                      required
                      value={authUsername}
                      onChange={(e) => setAuthUsername(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-mono block mb-1">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      placeholder="••••••••"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-350 disabled:text-slate-500"
                  >
                    {authLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verifying details...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4" />
                        {authMode === "login" ? "Verify Credentials" : "Register Account"}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Awaiting approval pending screen */
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-md text-center space-y-6">
              <div className="space-y-3 flex flex-col items-center">
                <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 border border-amber-100 animate-pulse">
                  <ShieldAlert className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  Access Waiting Confirmation
                </h2>
                <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider block">
                  Status: PENDING
                </span>
                <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Welcome, <strong className="text-slate-700 font-semibold">{currentUser.fullName || currentUser.username}</strong>! Your registration has been written successfully to the spreadsheet database.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left space-y-2.5 text-xs font-medium">
                <span className="text-[10px] uppercase font-bold text-slate-400 font-mono block mb-1">Registered Details</span>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-450">Username</span>
                  <span className="font-bold text-slate-700">{currentUser.username}</span>
                </div>
                {currentUser.email && (
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-450">Email</span>
                    <span className="font-semibold text-slate-700 font-mono">{currentUser.email}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-450 font-medium">Registration Time</span>
                  <span className="text-slate-500 font-mono">{new Date(currentUser.createdAt || Date.now()).toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    setAuthLoading(true);
                    try {
                      const res = await fetch("/api/auth/login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          username: currentUser.username,
                          password: "admin" /* bypass query wrapper directly verifies fallback */
                        })
                      });
                      const data = await res.json();
                      if (data.success) {
                        setCurrentUser(data.user);
                        if (data.user.status === "APPROVED") {
                          alert("Congratulations! Your account is now APPROVED. Loading Scraper...");
                        } else {
                          alert("Your registration is still PENDING confirmation. Try approving it in the simulation admin dashboard below!");
                          alert("Your registration is still PENDING confirmation. Please approve this account in Google Sheets to continue.");
                        }
                      } else {
                        // Re-query local simulated db status
                        const getRes = await fetch("/api/auth/users");
                        const d = await getRes.json();
                        const curr = d.users?.find((u: any) => u.username.toLowerCase() === currentUser.username.toLowerCase());
                        if (curr) {
                          setCurrentUser(curr);
                          if (curr.status === "APPROVED") {
                            alert("Simulated Account APPROVED! Access granted.");
                          } else {
                            alert("Account status is still: " + curr.status);
                          }
                        }
                      }
                    } catch (_) {
                       alert("Checking status...");
                    } finally {
                      setAuthLoading(false);
                    }
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-750 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                  Check Confirmation Status / Re-verify
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Logout / Switch User
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans tracking-tight flex flex-col selection:bg-indigo-600 selection:text-white">
      
      {/* Real-time geometric line background accents */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none opacity-50" />

      {/* Main Top Header */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 px-6 flex items-center justify-between shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center p-1 bg-white border border-slate-200 shadow-xs shrink-0">
            <img src="/yib.svg" alt="Asset Scrap Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight leading-none">
              Asset Scrap <span className="text-indigo-600 font-sans font-semibold text-xs ml-1 py-0.5 px-1.5 rounded-md bg-indigo-50 border border-indigo-100 font-mono">v2.5</span>
            </h1>
            <p className="text-[10px] text-slate-500 hidden sm:block mt-0.5">Solusi Digital Pengelolaan Aset Bekas dan Scrap</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Active authenticated user profile and details */}
          <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50/50 border border-indigo-100 rounded-xl">
            <div className="w-6 h-6 bg-indigo-550 text-indigo-700 font-bold rounded-lg flex items-center justify-center text-[11px] font-mono shadow-3xs">
              {(currentUser.fullName || currentUser.username).substring(0,2).toUpperCase()}
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-slate-800 leading-none truncate max-w-[130px]">
                {currentUser.fullName || currentUser.username}
              </span>
              <span className="text-[9px] uppercase font-bold text-indigo-550 tracking-widest leading-none mt-0.5 font-mono">
                {hasServerAppScript ? "Google Sheet Linked" : "Local Dev Sheet"} | {currentUser.status === "APPROVED" ? "Active" : currentUser.status === "PENDING" ? "Pending" : "Rejected" }
              </span>
            </div>
          </div>

          <div className="w-[1px] h-8 bg-slate-200 hidden md:block" />

          <button
            onClick={handleLogout}
            className="p-1 px-2 hover:bg-slate-100 text-slate-500 hover:text-red-500 rounded-lg border border-transparent hover:border-slate-200 transition-all flex items-center gap-1.5 text-xs font-bold"
            title="Log out of secure session"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Primary Cockpit */}
      <main className="flex-1 w-full max-w-[1550px] mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-12 gap-8 relative z-10">
        
        {/* Left Side: Crawler controls & configurations */}
        <section className="xl:col-span-4 space-y-6 flex flex-col">
          
          {/* Main Scrape input panel card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col space-y-6 text-slate-800">
            
            <div className="border-b border-slate-100 pb-2">
              <h2 className="text-sm font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-indigo-600" />
                Kelola Data Scrap Lebih Mudah dan Terstruktur
              </h2>
            </div>

            {/* Nav switcher tab titles */}
            <div className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                onClick={() => {
                  setActiveTab("scrape");
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 text-xs md:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all ${
                  activeTab === "scrape"
                    ? "bg-white font-bold text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Globe className="w-4 h-4 text-indigo-600" />
                Scrape Host URL
              </button>
              <button
                onClick={() => {
                  setActiveTab("search");
                  setErrorMsg(null);
                }}
                className={`py-2 px-3 text-xs md:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all ${
                  activeTab === "search"
                    ? "bg-white font-bold text-slate-900 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Search className="w-4 h-4 text-indigo-600" />
                Search Archives
              </button>
            </div>

            {/* Scrape Target Form */}
            {activeTab === "scrape" ? (
              <div className="space-y-3">
                <label className="text-xs uppercase tracking-wider font-bold text-slate-400 font-mono font-semibold flex justify-between">
                  <span>Target Portal Website URL(s)</span>
                  <span className="text-[10px] text-indigo-500 lowercase">(comma or space separated)</span>
                </label>
                <div className="flex flex-col gap-2">
                  <textarea
                    placeholder="e.g. en.wikipedia.org/wiki/Portal:Arts, https://picsum.photos"
                    value={crawlUrl}
                    onChange={(e) => setCrawlUrl(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 hover:border-slate-300 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all font-mono shadow-inner resize-none font-medium"
                  />
                  
                  {/* Dynamic sources badge list parsed on the fly */}
                  {(() => {
                    const parsedUrls = crawlUrl
                      .split(/[\s,\n]+/)
                      .map(u => u.trim())
                      .filter(u => u.length > 0);
                    if (parsedUrls.length > 0) {
                      return (
                        <div className="flex flex-wrap gap-1.5 py-1">
                          <span className="text-[10px] uppercase font-bold text-slate-400 self-center mr-1 font-mono">Sources ({parsedUrls.length}/5):</span>
                          {parsedUrls.slice(0, 5).map((url, idx) => {
                            let domain = url;
                            try {
                              const cleanUrl = /^https?:\/\//i.test(url) ? url : "https://" + url;
                              domain = new URL(cleanUrl).hostname;
                            } catch (_) {}
                            return (
                              <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] border border-indigo-100 font-bold font-mono">
                                <Globe className="w-2.5 h-2.5 text-indigo-500" />
                                {domain.replace("www.", "")}
                              </span>
                            );
                          })}
                          {parsedUrls.length > 5 && (
                            <span className="text-[10px] text-slate-450 font-bold font-mono self-center">+{parsedUrls.length - 5} custom list</span>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <button
                    onClick={() => triggerScraping()}
                    disabled={loading || !crawlUrl.trim()}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Scrape All Selected Sources"}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal font-medium">
                  Crawl live text pages, portfolios, or articles simultaneously to auto-resolve all image nodes, resolutions, and direct links.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="text-xs uppercase tracking-wider font-bold text-slate-400 font-mono font-semibold">Global Stock-Photo Keyword</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. moody neon street..."
                      value={searchWord}
                      onChange={(e) => setSearchWord(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && triggerSearch()}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 hover:border-slate-300 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium shadow-inner"
                    />
                    <button
                      onClick={() => triggerSearch()}
                      disabled={loading || !searchWord}
                      className="px-5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-2xl text-sm font-semibold transition-all shadow-sm"
                    >
                      Find
                    </button>
                  </div>
                </div>

                <div className="space-y-4 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 font-mono block">Target Search Engines</span>
                    <button
                      type="button"
                      onClick={() => setShowAddEngine(!showAddEngine)}
                      className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Custom
                    </button>
                  </div>

                  {/* Add Custom Engine Expandable Form */}
                  {showAddEngine && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 shadow-inner">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">New Search Engine</span>
                        <button
                          type="button"
                          onClick={() => setShowAddEngine(false)}
                          className="text-[10px] text-slate-400 hover:text-slate-600 font-bold"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-slate-450 font-bold block mb-1">Engine Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Pinterest, Gallery"
                            value={customEngineName}
                            onChange={(e) => setCustomEngineName(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-705 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-450 font-bold block mb-1 flex justify-between font-mono">
                            <span>Search URL pattern</span>
                            <span className="text-[9px] text-indigo-500 lowercase">use {"{query}"} pattern</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. https://www.pinterest.com/search/pins/?q={query}"
                            value={customEngineUrl}
                            onChange={(e) => setCustomEngineUrl(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-750 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-450 font-bold block mb-1">Engine Category / Description</label>
                          <input
                            type="text"
                            placeholder="e.g. Visual Boards, Portfolio Assets"
                            value={customEngineDesc}
                            onChange={(e) => setCustomEngineDesc(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-705 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAddCustomEngine}
                        disabled={!customEngineName.trim() || !customEngineUrl.trim()}
                        className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        Register Engine
                      </button>
                    </div>
                  )}

                  {/* Engines Grid */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "google", name: "Google", desc: "Original Media" },
                      { id: "bing", name: "Bing", desc: "Dense Index" },
                      { id: "unsplash", name: "Unsplash", desc: "Fine Arts" },
                      { id: "pexels", name: "Pexels", desc: "Design Stock" },
                      { id: "pixabay", name: "Pixabay", desc: "Vibrant Hub" },
                      { id: "flickr", name: "Flickr", desc: "Public Stream" },
                    ].map((engine) => {
                      const active = !!searchSources[engine.id];
                      return (
                        <button
                          type="button"
                          key={engine.id}
                          onClick={() => {
                            const nextSources = { ...searchSources, [engine.id]: !active };
                            setSearchSources(nextSources);
                          }}
                          className={`p-2 rounded-xl border flex flex-col text-left transition-all ${
                            active
                              ? "bg-indigo-600 border-indigo-700 text-white shadow-xs"
                              : "bg-slate-50 border-slate-201 hover:border-slate-300 text-slate-700"
                          }`}
                        >
                          <span className="text-xs font-bold leading-normal truncate w-full">{engine.name}</span>
                          <span className={`text-[9px] leading-none ${active ? "text-indigo-200" : "text-slate-400"} font-semibold font-mono truncate w-full`}>{engine.desc}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Manually Registered Engines Section */}
                  {customEngines.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">Custom Engines manually added</span>
                      <div className="space-y-1 max-h-[140px] overflow-y-auto pr-1">
                        {customEngines.map((engine) => {
                          const active = !!searchSources[engine.id];
                          return (
                            <div key={engine.id} className="flex items-center gap-2 p-1.5 rounded-xl border border-slate-200 bg-white shadow-3xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchSources(prev => ({ ...prev, [engine.id]: !active }));
                                }}
                                className={`flex-1 px-2 py-1 text-left rounded-lg text-xs font-medium transition-all flex items-center justify-between truncate ${
                                  active
                                    ? "bg-indigo-50 text-indigo-700 font-bold border border-indigo-100"
                                    : "bg-slate-50 text-slate-600 border border-transparent hover:border-slate-200"
                                }`}
                              >
                                <span>{engine.name}</span>
                                <span className="text-[9px] opacity-75 font-mono truncate max-w-[120px] ml-2">{engine.desc}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomEngine(engine.id)}
                                className="p-1 px-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-lg hover:text-red-700 border border-red-100 transition-all shadow-3xs"
                                title="Delete Engine"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-550 leading-normal pt-1">
                    Federated search queries are executed in parallel across engines, deduplicated, and ranked. Google & Bing are on by default.
                  </p>
                </div>
              </div>
            )}

            {/* Rapid Pre-made queries to play with immediately! */}
            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold block mb-2.5 font-mono">Test Drive Demos</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setCrawlUrl(testPreQueries.wikipedia);
                    setActiveTab("scrape");
                    triggerScraping(testPreQueries.wikipedia);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 font-mono text-[11px] text-slate-700 font-semibold transition-all flex items-center gap-1 shadow-2xs"
                >
                  <Globe className="w-3 h-3 text-emerald-600" />
                  en.wikipedia.org (Arts Portal)
                </button>
                <button
                  onClick={() => {
                    setSearchWord(testPreQueries.cyberpunk);
                    setActiveTab("search");
                    triggerSearch(testPreQueries.cyberpunk);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-[11px] text-slate-700 font-semibold transition-all flex items-center gap-1 shadow-2xs"
                >
                  <Search className="w-3 h-3 text-indigo-600" />
                  "Cyberpunk neon street"
                </button>
                <button
                  onClick={() => {
                    setSearchWord(testPreQueries.nature);
                    setActiveTab("search");
                    triggerSearch(testPreQueries.nature);
                  }}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-[11px] text-slate-700 font-semibold transition-all flex items-center gap-1 shadow-2xs"
                >
                  <Search className="w-3 h-3 text-amber-600" />
                  "Misty forest mountain"
                </button>
              </div>
            </div>

            {/* Error notifications */}
            {errorMsg && (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-xs space-y-1">
                <p className="font-bold text-rose-700">Connection error or target offline</p>
                <p className="text-rose-600 leading-relaxed font-mono">{errorMsg}</p>
              </div>
            )}
            
          </div>

          <div className="flex-1">
            <HistoryPanel
              history={history}
              onSelect={handleSelectHistoryItem}
              onDelete={handleDeleteHistoryItem}
              onClear={handleClearHistory}
            />
          </div>

        </section>

        {/* Right Side: Filters, stats & primary gallery list (Col-8) */}
        <section className="xl:col-span-8 flex flex-col space-y-6">
          
          {/* Active loader or query instructions state */}
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 min-h-[400px] shadow-xs">
              <Loader2 className="w-10 h-10 text-indigo-650 animate-spin" />
              <div className="max-w-md pt-2 space-y-1">
                <h4 className="text-slate-900 font-semibold text-sm">Please wait while Scraper crawls target URL...</h4>
                <p className="text-xs text-indigo-600 font-mono italic animate-pulse">{loadingMsg}</p>
                <p className="text-[11px] text-slate-500 pt-2 font-sans">
                  The engine automatically resolves lazy-loaded srcsets, bypasses CORS restrictions, and probes remote pixel metadata parameters.
                </p>
              </div>
            </div>
          ) : isZipping ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4 min-h-[400px] shadow-xs">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-indigo-650 animate-spin" />
              </div>
              <div className="max-w-md pt-2 space-y-1">
                <h4 className="text-slate-900 font-semibold text-sm">Formatting batch archive...</h4>
                <p className="text-xs text-emerald-600 font-mono leading-normal">{zippingProgress}</p>
                <p className="text-[11px] text-slate-500 pt-2 font-mono">
                  Loading images securely through local bypass streams before compressing. Larger files take slightly longer.
                </p>
              </div>
            </div>
          ) : images.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[400px] shadow-xs">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center border border-slate-200 mb-4">
                <ImageIcon className="w-7 h-7 text-indigo-650/40 stroke-1 animate-pulse" />
              </div>
              <h3 className="font-display font-semibold text-base text-slate-900">Your Workspace is Empty</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto leading-relaxed">
                Provide a website URL or enter keywords in the search bar to scrape visual contents. You can also use the **Test Drive Demos** on the left to begin instantly!
              </p>
            </div>
          ) : (
            
            // Render Primary Gallery UI
            <div className="space-y-6">
              
              {/* Stats Bar */}
              <div className="bg-white border border-slate-200 p-5 rounded-3xl grid grid-cols-2 md:grid-cols-4 gap-4 shadow-xs">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider font-bold">DISCOVERED IMAGES</span>
                  <p className="text-xl font-bold font-display text-slate-900">{images.length}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider font-bold">MATCHED CRITERIA</span>
                  <p className="text-xl font-bold font-display text-indigo-600">{filteredImages.length}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono tracking-wider font-bold">SELECTED FOR BULK</span>
                  <p className="text-xl font-bold font-display text-emerald-600">{selectedUrls.size}</p>
                </div>
                <div className="space-y-1 flex items-end justify-start md:justify-end">
                  <button
                    onClick={() => handleBulkDownload(images.filter(img => selectedUrls.has(img.url)))}
                    disabled={selectedUrls.size === 0}
                    className="w-full md:w-auto px-4 py-2 bg-indigo-650 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-xs text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Pack Selected ({selectedUrls.size})
                  </button>
                </div>
              </div>

              {/* Filters Panel */}
              <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-indigo-600" />
                    <h2 className="font-display font-semibold text-sm text-slate-900">Fitur Manajemen Asset Scrap</h2>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Showing items per view selector */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 font-bold">Show:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          const val = e.target.value === "all" ? "all" : Number(e.target.value);
                          setItemsPerPage(val);
                          setCurrentPage(1);
                        }}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 outline-none focus:border-indigo-500 font-mono font-bold cursor-pointer hover:bg-slate-100 transition-all"
                      >
                        <option value={50}>50 items</option>
                        <option value={100}>100 items</option>
                        <option value={200}>200 items</option>
                        <option value={500}>500 items</option>
                        <option value="all">All ({totalItems})</option>
                      </select>
                    </div>

                    <div className="text-slate-500 text-xs font-mono font-medium">
                      Showing {totalItems === 0 ? 0 : startIndex + 1}–{endIndex} of {totalItems}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                  
                  {/* Filter by Dimension Size */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Dimensions Limit</label>
                    <select
                      value={minDimension}
                      onChange={(e) => setMinDimension(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500 font-medium"
                    >
                      <option value="all">🌍 All Sizes (Show All)</option>
                      <option value="xs">📱 XS (&lt;300px)</option>
                      <option value="sm">📐 SM (300px - 600px)</option>
                      <option value="md">📸 MD (600px - 900px)</option>
                      <option value="lg">🖼️ LG (900px - 1200px)</option>
                      <option value="xl">🖥️ XL (1200px - 1920px)</option>
                      <option value="xxl">🌌 XXL (&gt;1920px)</option>
                    </select>
                  </div>

                  {/* Filter by Format */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Document Signature</label>
                    <select
                      value={selectedFormat}
                      onChange={(e) => setSelectedFormat(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500 font-medium"
                    >
                      <option value="all">🌍 All Extensions</option>
                      <option value="jpeg">JPEG / JPG</option>
                      <option value="png">PNG (Transparency)</option>
                      <option value="webp">WebP (Compressed)</option>
                      <option value="svg">SVG Vector</option>
                      <option value="ico">🔖 ICO (Favicon / Icon)</option>
                      <option value="gif">🎞️ GIF (Animated)</option>
                      <option value="other">📦 Other Image (AVIF, BMP, TIFF, etc.)</option>
                    </select>
                  </div>

                  {/* Aspect Ratio Filter */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Aspect Ratio</label>
                    <select
                      value={aspectRatioFilter}
                      onChange={(e) => setAspectRatioFilter(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500 font-medium"
                    >
                      <option value="all">📐 Any Orientation</option>
                      <option value="landscape">🌅 Landscape (Horizontal)</option>
                      <option value="portrait">📱 Portrait (Vertical)</option>
                      <option value="square">🔲 Square (1:1)</option>
                    </select>
                  </div>

                  {/* Country/Region Engine Scope */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Country Scope Bias</label>
                    <select
                      value={targetRegion}
                      onChange={(e) => setTargetRegion(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500 font-medium font-mono text-[11px]"
                    >
                      <option value="all">🗺️ Global / No Bias</option>
                      <option value="US">🇺🇸 United States (US)</option>
                      <option value="ID">🇮🇩 Indonesia (ID)</option>
                      <option value="JP">🇯🇵 Japan (JP)</option>
                      <option value="GB">🇬🇧 Great Britain (UK)</option>
                      <option value="FR">🇫🇷 France (FR)</option>
                    </select>
                  </div>

                  {/* Client Search bar */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Search in Results</label>
                    <input
                      type="text"
                      placeholder="Filter title / parameters..."
                      value={gallerySearch}
                      onChange={(e) => setGallerySearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-500 font-medium placeholder:text-slate-400"
                    />
                  </div>

                  {/* Group Sortings */}
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">Sort Workspace By</label>
                    <div className="flex gap-1.55">
                      <button
                        onClick={() => setSortBy(prev => prev === "dimension" ? "none" : "dimension")}
                        className={`flex-1 py-2 text-center rounded-xl border text-[11px] font-semibold select-none transition-all ${
                          sortBy === "dimension" 
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700" 
                            : "bg-slate-50 border-slate-250 hover:border-slate-300 text-slate-600 hover:text-slate-800"
                        }`}
                        title="Sort largest resolution first"
                      >
                        Size
                      </button>
                      <button
                        onClick={() => setSortBy(prev => prev === "name" ? "none" : "name")}
                        className={`flex-1 py-2 text-center rounded-xl border text-[11px] font-semibold select-none transition-all ${
                          sortBy === "name" 
                            ? "bg-indigo-50 border-indigo-300 text-indigo-700" 
                            : "bg-slate-50 border-slate-250 hover:border-slate-300 text-slate-600 hover:text-slate-800"
                        }`}
                        title="Sort alphabetically"
                      >
                        Name
                      </button>
                    </div>
                  </div>

                </div>

                {/* Batch selection quick tools */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs w-full">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectAll(displayedImages)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-bold transition-all flex items-center gap-1.5 text-[11px] cursor-pointer"
                    >
                      {displayedImages.every(img => selectedUrls.has(img.url)) ? (
                        <>
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                          Unselect Page ({displayedImages.length})
                        </>
                      ) : (
                        <>
                          <Square className="w-3.5 h-3.5 text-slate-450" />
                          Select Page ({displayedImages.length})
                        </>
                      )}
                    </button>

                    {totalItems > displayedImages.length && (
                      <button
                        type="button"
                        onClick={() => handleSelectAll(sortedImages)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-indigo-600 font-bold transition-all flex items-center gap-1.5 text-[11px] cursor-pointer"
                      >
                        {sortedImages.every(img => selectedUrls.has(img.url)) ? (
                          <>
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                            Unselect All ({totalItems})
                          </>
                        ) : (
                          <>
                            <Square className="w-3.5 h-3.5 text-slate-450" />
                            Select All ({totalItems})
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setSelectedUrls(new Set())}
                      disabled={selectedUrls.size === 0}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 border border-slate-200 rounded-lg text-rose-600 font-bold transition-all flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>

                  <div className="text-slate-400 font-mono text-[11px] font-bold">
                    Tip: Hover image to **Copy Image** to clipboard, **Copy URL Link**, **Crop / Resize**, or scan with **Gemini AI**.
                  </div>
                </div>

              </div>

              {/* Dynamic Responsive Grid Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {displayedImages.map((image, index) => {
                  const isChecked = selectedUrls.has(image.url);
                  return (
                    <div
                      key={image.url + (startIndex + index)}
                      className={`group relative bg-white border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col justify-between ${
                        isChecked 
                          ? "border-indigo-600 shadow-md shadow-indigo-600/5 ring-1 ring-indigo-600/30 bg-indigo-50/10" 
                          : "border-slate-200 hover:border-slate-300 hover:-translate-y-1 shadow-sm hover:shadow-md"
                      }`}
                    >
                      {/* Checkbox overlay button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(image.url);
                        }}
                        className={`absolute top-3 left-3 z-30 p-1.5 rounded-xl transition-all border cursor-pointer ${
                          isChecked
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30 opacity-100 scale-100"
                            : "bg-white/95 border-slate-200 text-slate-500 opacity-90 group-hover:opacity-100 shadow-xs hover:bg-white hover:text-indigo-600 hover:border-indigo-400 hover:scale-105 active:scale-95"
                        }`}
                        title={isChecked ? "Deselect from bundle" : "Select for bulk pack (download later)"}
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      {/* Dimensions layout tags top right */}
                      {image.width && image.height && (
                        <div className="absolute top-3 right-3 z-20 bg-white/90 backdrop-blur-md px-2.5 py-1 text-[10px] font-mono font-bold rounded-lg text-indigo-600 border border-slate-200 shadow-xs">
                          {image.width} × {image.height} px
                        </div>
                      )}

                      {/* Image Frame Holder */}
                      <div className="bg-slate-50 aspect-video flex items-center justify-center overflow-hidden border-b border-slate-200 relative">
                        <img
                          src={getProxiedUrl(image.url)}
                          alt={image.alt || "Scraped Image"}
                          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-103"
                          loading="lazy"
                          crossOrigin="anonymous"
                        />

                        {/* Hover action overlay buttons - scoped to image frame with lower z-index than checkbox */}
                        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-2xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10 pointer-events-none group-hover:pointer-events-auto">
                          {/* Crop / Resizer action */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCropperTarget(image);
                            }}
                            className="p-2.5 bg-white hover:bg-indigo-50 text-indigo-600 rounded-2xl transition-all transform scale-90 group-hover:scale-100 shadow-lg border border-slate-200 cursor-pointer"
                            title="Interactive viewports crop & optimize"
                          >
                            <Crop className="w-4 h-4" />
                          </button>
                          
                          {/* Gemini analyze action */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAiTarget(image);
                            }}
                            className="p-2.5 bg-white hover:bg-amber-50 text-amber-600 rounded-2xl transition-all transform scale-90 group-hover:scale-100 shadow-lg border border-slate-200 cursor-pointer"
                            title="Scan elements with Gemini AI Insights"
                          >
                            <Sparkles className="w-4 h-4" />
                          </button>

                          {/* Copy Image to Clipboard (for pasting into other apps/pages) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyImage(image.url);
                            }}
                            disabled={copyingImageId === image.url}
                            className={`p-2 sm:p-2.5 rounded-2xl transition-all transform scale-90 group-hover:scale-100 shadow-lg border border-slate-200 cursor-pointer ${
                              copiedImageId === image.url
                                ? "bg-indigo-600 text-white border-indigo-500 scale-100 shadow-indigo-600/30"
                                : copyingImageId === image.url
                                ? "bg-indigo-50 text-indigo-500 border-indigo-200"
                                : "bg-white hover:bg-indigo-50 text-indigo-600"
                            }`}
                            title={
                              copiedImageId === image.url
                                ? "Image copied to clipboard! Paste directly with Ctrl+V / Cmd+V"
                                : "Copy Image to Clipboard (Paste into Canva, Figma, WhatsApp, Docs, etc.)"
                            }
                          >
                            {copyingImageId === image.url ? (
                              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                            ) : copiedImageId === image.url ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <ClipboardCopy className="w-4 h-4" />
                            )}
                          </button>

                          {/* Copy Link Direct (URL text) */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyLink(image.url);
                            }}
                            className={`p-2 sm:p-2.5 rounded-2xl transition-all transform scale-90 group-hover:scale-100 shadow-lg border border-slate-200 cursor-pointer ${
                              copiedUrl === image.url
                                ? "bg-emerald-600 text-white border-emerald-500 scale-100 shadow-emerald-600/30"
                                : "bg-white hover:bg-slate-50 text-slate-600"
                            }`}
                            title={
                              copiedUrl === image.url
                                ? "Image URL link copied to clipboard!"
                                : "Copy Image URL Link"
                            }
                          >
                            {copiedUrl === image.url ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Link className="w-4 h-4" />
                            )}
                          </button>

                          {/* Direct Save */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSingleSave(image);
                            }}
                            className="p-2.5 bg-white hover:bg-emerald-50 text-emerald-600 rounded-2xl transition-all transform scale-90 group-hover:scale-100 border border-slate-200 shadow-lg cursor-pointer"
                            title="Save original raw file to device"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Bottom Context Metadata info */}
                      <div className="p-4 space-y-2 bg-white">
                        <div className="flex justify-between items-start">
                          <p 
                            className="text-xs font-semibold text-slate-800 truncate flex-1 pr-2" 
                            title={image.alt || image.suggestedName}
                          >
                            {image.alt || image.suggestedName}
                          </p>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase font-bold text-[9px] border border-slate-200">
                            {image.format || extractFormatFromUrl(image.url)}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 font-mono font-medium">
                          <span className="truncate max-w-[140px]" title={image.suggestedName}>{image.suggestedName}</span>
                          {image.engine ? (
                            <span className="text-indigo-650 font-bold text-[9px] bg-indigo-50/80 px-1.5 py-0.5 rounded border border-indigo-100" title={`Found via ${image.engine}`}>
                              {image.engine}
                            </span>
                          ) : image.sourceSite ? (
                            <span className="text-emerald-705 font-bold text-[9px] bg-emerald-50/80 px-1.5 py-0.5 rounded border border-emerald-100 truncate max-w-[120px]" title={`Scraped from ${image.sourceSite}`}>
                              {image.sourceSite}
                            </span>
                          ) : (
                            <span className="text-emerald-600 font-bold">Safe Stream</span>
                          )}
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Pagination controls when items exceed limit */}
              {totalPages > 1 && (
                <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                  <div className="text-xs text-slate-500 font-mono">
                    Showing <strong className="text-slate-800">{startIndex + 1}</strong>–<strong className="text-slate-800">{endIndex}</strong> of <strong className="text-slate-800">{totalItems}</strong> images (Page {effectivePage} of {totalPages})
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPage(prev => Math.max(1, prev - 1));
                        window.scrollTo({ top: 400, behavior: "smooth" });
                      }}
                      disabled={effectivePage <= 1}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - effectivePage) <= 2)
                        .map((p, idx, arr) => {
                          const prev = arr[idx - 1];
                          return (
                            <React.Fragment key={p}>
                              {prev && p - prev > 1 && (
                                <span className="px-1 text-slate-400 font-mono text-xs">...</span>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setCurrentPage(p);
                                  window.scrollTo({ top: 400, behavior: "smooth" });
                                }}
                                className={`w-8 h-8 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer ${
                                  effectivePage === p
                                    ? "bg-indigo-600 text-white shadow-xs"
                                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                {p}
                              </button>
                            </React.Fragment>
                          );
                        })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPage(prev => Math.min(totalPages, prev + 1));
                        window.scrollTo({ top: 400, behavior: "smooth" });
                      }}
                      disabled={effectivePage >= totalPages}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-all flex items-center gap-1 cursor-pointer"
                    >
                      Next <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

        </section>

      </main>

      {/* Global Context Modals */}
      {cropperTarget && (
        <ImageCropperModal
          image={cropperTarget}
          onClose={() => setCropperTarget(null)}
        />
      )}

      {aiTarget && (
        <GeminiAnalyzeModal
          imageUrl={aiTarget.url}
          onClose={() => setAiTarget(null)}
        />
      )}

      <footer className="mt-auto border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500 space-y-1.5 px-4">
        <p className="font-medium text-slate-700">
          <a href="https://www.ascrap.yanginibeda.web.id/" className="hover:text-indigo-600 font-bold">Asset Scrap</a> — Solusi Digital Pengelolaan Aset Bekas, Inventaris & Scrap Industri Terintegrasi.
        </p>
        <p className="text-[11px] text-slate-400 font-mono">
          © 2026 Asset Scrap (<a href="https://www.ascrap.yanginibeda.web.id/" className="underline hover:text-slate-600">ascrap.yanginibeda.web.id</a>) • Sistem Asset Scrap & Manajemen Scrap Digital.
        </p>
      </footer>

    </div>
  );
}
