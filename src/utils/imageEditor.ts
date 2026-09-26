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
    if (pathname.endsWith(".png")) return "png";
    if (pathname.endsWith(".webp")) return "webp";
    if (pathname.endsWith(".gif")) return "gif";
    if (pathname.endsWith(".svg")) return "svg";
    return "jpeg"; // default fallback
  } catch (_) {
    return "jpeg";
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
