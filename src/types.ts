export interface ScrapedImage {
  url: string;
  sourceUrl: string;
  alt: string;
  width?: number; // Loaded asynchronously on client
  height?: number; // Loaded asynchronously on client
  format?: string; // Loaded from url structure or content
  suggestedName: string;
  isSelected?: boolean;
  engine?: string;
  sourceSite?: string;
}

export interface ScrapeHistoryItem {
  id: string;
  timestamp: string;
  type: "scrape" | "search";
  query: string; // URL crawled or keyword searched
  imageCount: number;
}

export interface CustomEngine {
  id: string;
  name: string;
  url: string;
  desc: string;
}

export interface CropPreset {
  id: string;
  name: string;
  category: "Social" | "Device" | "Standard";
  aspectRatio: number; // width / height
  width: number;
  height: number;
  icon: string;
}

export const CROP_PRESETS: CropPreset[] = [
  { id: "square", name: "Instagram Post (1:1)", category: "Social", aspectRatio: 1, width: 1080, height: 1080, icon: "Square" },
  { id: "portrait", name: "Instagram Portrait (4:5)", category: "Social", aspectRatio: 0.8, width: 1080, height: 1350, icon: "RectangleVertical" },
  { id: "story", name: "Story / TikTok (9:16)", category: "Social", aspectRatio: 9 / 16, width: 1080, height: 1920, icon: "Smartphone" },
  { id: "youtube", name: "YouTube Thumbnail (16:9)", category: "Social", aspectRatio: 16 / 9, width: 1280, height: 720, icon: "Tv" },
  { id: "twitter", name: "Twitter Post (16:9)", category: "Social", aspectRatio: 16 / 9, width: 1200, height: 675, icon: "Tv2" },
  { id: "facebook", name: "Facebook Cover (20.5:8)", category: "Social", aspectRatio: 20.5 / 8, width: 820, height: 312, icon: "RectangleHorizontal" },
  { id: "desktop_1080p", name: "Desktop FHD (16:9)", category: "Device", aspectRatio: 16 / 9, width: 1920, height: 1080, icon: "Laptop" },
  { id: "desktop_4k", name: "Desktop 4K (16:9)", category: "Device", aspectRatio: 16 / 9, width: 3840, height: 2160, icon: "Monitor" },
  { id: "tablet", name: "iPad / Tablet (4:3)", category: "Device", aspectRatio: 4 / 3, width: 1024, height: 768, icon: "Tablet" },
];
