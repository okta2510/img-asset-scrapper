/**
 * Utility tools for loading, analyzing, resizing, and cropping images
 * using client-side HTML5 Canvas on proxied endpoints to circumvent CORS issues.
 */

export function getProxiedUrl(originalUrl: string): string {
  if (!originalUrl) return "";
  if (originalUrl.startsWith("data:") || originalUrl.startsWith("blob:")) {
    return originalUrl;
  }
  return `/api/proxy?url=${encodeURIComponent(originalUrl)}`;
}

export function extractFormatFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const search = urlObj.search.toLowerCase();

    if (pathname.endsWith(".ico") || search.includes("format=ico") || pathname.includes("favicon") || url.toLowerCase().includes(".ico")) return "ico";
    if (pathname.endsWith(".png") || search.includes("format=png")) return "png";
    if (pathname.endsWith(".webp") || search.includes("format=webp")) return "webp";
    if (pathname.endsWith(".gif") || search.includes("format=gif")) return "gif";
    if (pathname.endsWith(".svg") || search.includes("format=svg")) return "svg";
    if (pathname.endsWith(".avif") || search.includes("format=avif")) return "avif";
    if (pathname.endsWith(".bmp") || search.includes("format=bmp")) return "bmp";
    if (pathname.endsWith(".tiff") || pathname.endsWith(".tif")) return "tiff";
    if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg") || search.includes("format=jpg") || search.includes("format=jpeg")) return "jpeg";

    if (urlObj.hostname.includes("unsplash.com") || urlObj.hostname.includes("picsum.photos") || urlObj.hostname.includes("pexels.com")) {
      return "jpeg";
    }

    const match = pathname.match(/\.([a-z0-9]{3,4})$/);
    if (match && match[1]) {
      return match[1];
    }

    return "other";
  } catch (_) {
    if (url.toLowerCase().includes(".ico") || url.toLowerCase().includes("favicon")) return "ico";
    return "other";
  }
}

/**
 * Loads image asynchronously to extract dimensions and file signature format
 */
export function loadImageMeta(url: string): Promise<{ width: number; height: number; format: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        format: extractFormatFromUrl(url)
      });
    };
    img.onerror = () => {
      reject(new Error("Unable to load image dimensions via proxy interface"));
    };
    // Make sure we load via Proxy to secure CORS access for canvas draw operations!
    img.src = getProxiedUrl(url);
  });
}

export interface ProcessingConfig {
  format: "jpeg" | "png" | "webp";
  quality: number; // 0.1 to 1.0
  maxWidth?: number;
  maxHeight?: number;
  cropArea?: {
    x: number; // percentage 0-100 or actual pixel bounds
    y: number;
    width: number;
    height: number;
    aspectRatio?: number;
  };
}

/**
 * Renders the image on a canvas applying size caps, user crop regions, quality level, and selected format
 */
export async function optimizeAndCropImage(
  imageUrl: string,
  config: ProcessingConfig
): Promise<{ blob: Blob; url: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return reject(new Error("Failed to initialize canvas render context"));
      }

      // Calculate crop bounds
      let sx = 0;
      let sy = 0;
      let sWidth = img.naturalWidth;
      let sHeight = img.naturalHeight;

      if (config.cropArea) {
        sx = config.cropArea.x;
        sy = config.cropArea.y;
        sWidth = config.cropArea.width;
        sHeight = config.cropArea.height;
      }

      // Define default post-crop output dimensions
      let dWidth = sWidth;
      let dHeight = sHeight;

      // Handle custom downscaling constraints (e.g. max resolution caps)
      if (config.maxWidth && dWidth > config.maxWidth) {
        const ratio = config.maxWidth / dWidth;
        dWidth = config.maxWidth;
        dHeight = Math.round(dHeight * ratio);
      }
      if (config.maxHeight && dHeight > config.maxHeight) {
        const ratio = config.maxHeight / dHeight;
        dHeight = config.maxHeight;
        dWidth = Math.round(dWidth * ratio);
      }

      canvas.width = dWidth;
      canvas.height = dHeight;

      // Draw active image subset on viewport
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, dWidth, dHeight);

      // Convert to blob
      const mimeType = `image/${config.format}`;
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const objectUrl = URL.createObjectURL(blob);
            resolve({
              blob,
              url: objectUrl,
              width: dWidth,
              height: dHeight
            });
          } else {
            reject(new Error("Failed to export Canvas to Blob stream"));
          }
        },
        mimeType,
        config.quality
      );
    };

    img.onerror = () => {
      reject(new Error("Could not acquire image bytes via CORS proxy for processing"));
    };

    img.src = getProxiedUrl(imageUrl);
  });
}

/**
 * Downloads a client-side Blob to the device as a named file
 */
export function triggerFileDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const tag = document.createElement("a");
  tag.href = url;
  tag.download = fileName;
  document.body.appendChild(tag);
  tag.click();
  document.body.removeChild(tag);
  URL.revokeObjectURL(url);
}

/**
 * Converts any image Blob (JPG, WebP, SVG, GIF, etc.) to PNG Blob for clipboard compatibility
 */
async function convertBlobToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.crossOrigin = "anonymous";

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width || 800;
        canvas.height = img.naturalHeight || img.height || 600;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Unable to create canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            reject(new Error("Canvas conversion to PNG failed"));
          }
        }, "image/png");
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for clipboard conversion"));
    };

    img.src = objectUrl;
  });
}

/**
 * Copies actual image binary data to the clipboard as PNG
 * so it can be pasted into any external software or web app (Figma, Docs, WhatsApp, Slack, etc.)
 */
export async function copyImageToClipboard(imageUrl: string): Promise<void> {
  const proxiedUrl = getProxiedUrl(imageUrl);
  const res = await fetch(proxiedUrl);
  if (!res.ok) {
    throw new Error(`Failed to retrieve image: ${res.statusText}`);
  }
  const blob = await res.blob();
  const pngBlob = await convertBlobToPng(blob);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": pngBlob
      })
    ]);
  } else {
    throw new Error("Clipboard image copy is not supported in this browser environment");
  }
}

