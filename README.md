# yanginibeda-imgrap - Complete Technical Reference Manual

`yanginibeda-imgrap` is a full-stack image extraction, viewport customization, and intelligence analysis machine. It enables users to simultaneously crawl multiple custom websites or query global photography archives across federated engines (Google, Bing, Unsplash), analyze images using Gemini API Insights, dynamically crop/recompress visual assets, and package deliverables in a unified batch zip container.

---

## 🚀 Core Features & capabilities

1. **Multi-Source Crawling Pipeline**: Input multiple URLs simultaneously (separated by white spaces, commas, or line breaks). The backend asynchronously scrapes up to 5 parallel target web endpoints, bypasses responsive `srcset` arrays, resolves lazy-loaded sources, and consolidates high-res image nodes.
2. **Federated Multi-Engine Stock Search**: Query Google Images, Bing Images, and Unsplash concurrently to aggregate high-quality stock photography. Results are automatically merged, deduplicated, and attributed to their originating engine of discovery.
3. **Robust CORS & SSL Bypass Proxy**: An integrated backend stream proxy proxies incoming requests to overcome CORS issues. It includes a smart fallback engine employing Node's legacy sockets to negotiate custom ClientHello TLS structures (supporting low version handshakes, preventing `ECONNRESET`, and resolving complex SSL/Undici certificate timeouts).
4. **Interactive Studio Image Cropper**: Optimize and modify layouts using real-time canvas offsets. Support for custom dimensions and high-contrast bounding boxes with social-media viewport presets (Instagram grid, Pinterest pins, Facebook covers). Includes precision sliders for focal positions (X/Y offsets).
5. **Quality Compactor**: Encode targets to `webp`, `jpeg`, or `png` files, with quality adjustments (sliders from 5% to 100%) and instant sizing estimations.
6. **Gemini AI Insights Component**: Direct, server-side payload delivery to Google’s Gemini model to perform automated visual surveys, palette tagging, background detection, and web composition reviews.
7. **Copy to Clipboard & Batch Save**: Copy direct sources on hover or select dozens of images for instant compression into an offline ZIP download.

---

## 🛠️ Tech Stack & Key Packages

### Frontend (Client-side)
* **Framework**: React 18+ (Vite)
* **Language**: TypeScript
* **State Management**: Standalone stateful hooks
* **Styling**: Tailwind CSS & custom ambient vectors
* **Icons**: `lucide-react`
* **ZIP Compiler**: `jszip`

### Backend (Server-side)
* **Framework**: Express.js
* **HTML Parsing**: `cheerio`
* **AI Integration**: `@google/genai` (Official modern SDK)
* **Authentication**: Environment variables via `dotenv`
* **Transport Clients**: Native standard `fetch` with raw fallback streams using Node's native `https` & `http` client agents.

---

## 📂 Project Architecture

```bash
├── /metadata.json           # Application descriptor & iFrame configurations
├── /package.json            # Node script execution workflows & declarations
├── /server.ts               # Full-stack backend launcher (Proxy, Scrapers, Gemini middleware)
└── /src                     # Frontend workspace
    ├── /main.tsx            # DOM mounting root entry
    ├── /App.tsx             # Central Workspace Hub (Crawl interface, Sorting, and Gallery grids)
    ├── /types.ts            # Common TypeScript interfaces & enums
    ├── /index.css           # Global custom typography, fonts (Inter), and Tailwind core imports
    ├── /utils
    │   └── imageEditor.ts   # Canvas rendering computations for client crop streams
    └── /components
        ├── ImageCropperModal.tsx  # Optimized canvas crop layout
        └── GeminiAnalyzeModal.tsx # Automated visual analytics console
```

---

## 🔬 Operational Workflows

### 1. Unified Multitasking Crawl Cycle
When the user submits target Host URLs:
```
[User Text Input (Multiple Web URLs)] 
   |
   +--> Parsed by regular expression /[\s,\n]+/ 
   |
   +--> POST call to "/api/scrape" (Max 5 targets)
   |
   +--> (Backend) Concurrent fetch with robust spoofed User-Agents
   |       |
   |       +-- (Success) standard fetch response
   |       +-- (Fallback) Native HttpsAgent with TLS re-negotiation (rejectUnauthorized=false)
   |
   +--> Parsed with Cheerio -> Extracts links, data-src, fallback srcset matrices
   |
   +--> Deduplicates, maps clean names -> Returned back to client
```

### 2. Multi-Engine Image Query Flow
Search feeds aggregate stock photography from world-class engines:
* **Google Images**: Scrapes standard image pages, bypasses Google's dynamic frame layouts, and decrypts `/imgres?imgurl=` paths.
* **Bing Search**: Pulls from the `.iusc` container, decoding structured JSON attributes to isolate premium `murl` nodes.
* **Unsplash Direct**: Resolves search queries and cleans URL parameter heights/widths (`w`, `h`) to retrieve the highest original resolutions.

### 3. Proxy Delivery & CORS bypass
Since browsers reject standard canvas loading on third-party links, all visual previews and assets destined for JSZip downloads are routed through `/api/proxy?url=...`. This allows headers such as `Access-Control-Allow-Origin: *` to be correctly appended on the fly to prevent canvas taint.
