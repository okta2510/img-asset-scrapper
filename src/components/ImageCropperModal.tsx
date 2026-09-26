import React, { useState, useEffect, useRef } from "react";
import { X, Crop, Sliders, Download, Sparkles, AlertCircle, FileType, Check } from "lucide-react";
import { ScrapedImage, CROP_PRESETS, CropPreset } from "../types";
import { getProxiedUrl, optimizeAndCropImage, triggerFileDownload, extractFormatFromUrl } from "../utils/imageEditor";

interface ImageCropperModalProps {
  image: ScrapedImage;
  onClose: () => void;
}

export default function ImageCropperModal({ image, onClose }: ImageCropperModalProps) {
  const [format, setFormat] = useState<"jpeg" | "png" | "webp">("jpeg");
  const [quality, setQuality] = useState<number>(0.85);
  const [activePreset, setActivePreset] = useState<string>("custom");

  // Crop dimensions (relative to actual image pixels)
  const [naturalWidth, setNaturalWidth] = useState(1);
  const [naturalHeight, setNaturalHeight] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropWidth, setCropWidth] = useState(1);
  const [cropHeight, setCropHeight] = useState(1);

  // Resize scaling properties
  const [targetWidth, setTargetWidth] = useState<number>(0);
  const [maintainRatio, setMaintainRatio] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [estimatedSize, setEstimatedSize] = useState<string>("Calculating...");

  // Load natural dimensions on mount
  useEffect(() => {
    const imgObj = new Image();
    imgObj.crossOrigin = "anonymous";
    imgObj.onload = () => {
      setNaturalWidth(imgObj.naturalWidth);
      setNaturalHeight(imgObj.naturalHeight);
      setCropWidth(imgObj.naturalWidth);
      setCropHeight(imgObj.naturalHeight);
      setCropX(0);
      setCropY(0);
      setTargetWidth(imgObj.naturalWidth);

      // Detect original format
      const originalFormat = extractFormatFromUrl(image.url);
      if (originalFormat === "png" || originalFormat === "webp" || originalFormat === "jpeg") {
        setFormat(originalFormat as any);
      }
    };
    imgObj.src = getProxiedUrl(image.url);
  }, [image.url]);

  // Handle Preset application
  const applyPreset = (preset: CropPreset | "custom") => {
    if (preset === "custom") {
      setActivePreset("custom");
      setCropX(0);
      setCropY(0);
      setCropWidth(naturalWidth);
      setCropHeight(naturalHeight);
      setTargetWidth(naturalWidth);
      return;
    }

    setActivePreset(preset.id);
    
    // Calculate cropped sub-regions keeping the centered crop
    const targetAspect = preset.aspectRatio;
    const currentAspect = naturalWidth / naturalHeight;

    let finalW = naturalWidth;
    let finalH = naturalHeight;

    if (currentAspect > targetAspect) {
      // Image is wider than crop aspect
      finalW = naturalHeight * targetAspect;
    } else {
      // Image is taller than crop aspect
      finalH = naturalWidth / targetAspect;
    }

    // Centered coordinates
    const xOffset = Math.floor((naturalWidth - finalW) / 2);
    const yOffset = Math.floor((naturalHeight - finalH) / 2);

    setCropX(xOffset);
    setCropY(yOffset);
    setCropWidth(Math.floor(finalW));
    setCropHeight(Math.floor(finalH));
    setTargetWidth(preset.width);
  };

  // Recalculate aspect/ratio sizing safely
  const handleScaleWidthChange = (val: number) => {
    if (val <= 0) return;
    setTargetWidth(val);
  };

  // Calculate dynamic display statistics
  useEffect(() => {
    // Basic approximate file sizing heuristic for high-resolution canvas streams
    const pixels = targetWidth * (targetWidth / (cropWidth || 1)) * (cropHeight || 1);
    const bytePerPixel = format === "png" ? 3 : format === "webp" ? 0.45 * quality : 0.6 * quality;
    const sizeInKb = (pixels * bytePerPixel) / 1024;
    
    if (sizeInKb > 1024) {
      setEstimatedSize(`${(sizeInKb / 1024).toFixed(1)} MB`);
    } else {
      setEstimatedSize(`${Math.round(sizeInKb)} KB`);
    }
  }, [targetWidth, cropWidth, cropHeight, format, quality]);

  // Execute processing & trigger direct download
  const handleProcessAndDownload = async () => {
    setIsProcessing(true);
    try {
      const calculatedHeight = Math.round(cropHeight * (targetWidth / cropWidth));

      const result = await optimizeAndCropImage(image.url, {
        format,
        quality,
        maxWidth: targetWidth,
        maxHeight: calculatedHeight,
        cropArea: {
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight
        }
      });

      // Name output file logically
      const extension = format;
      const cleanBaseName = image.suggestedName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const outputName = `${cleanBaseName}_optimized_${targetWidth}x${calculatedHeight}.${extension}`;

      triggerFileDownload(result.blob, outputName);
      onClose();
    } catch (err: any) {
      alert(`Optimization failed: ${err.message || "Canvas draw failure. Select safe image parameters."}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md overflow-y-auto animate-fade-in">
      <div id="cropper-card" className="relative bg-white border border-slate-200 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl text-slate-850 flex flex-col my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-xl">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-semibold text-lg text-slate-900">Crop & Optimize Workspace</h3>
              <p className="text-xs text-slate-500">Viewport social crops, file compaction and canvas resizing selectors</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-800 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Workspace Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 flex-1 overflow-hidden">
          
          {/* Left panel: Live cropped region preview box */}
          <div className="lg:col-span-7 bg-slate-50 p-6 flex flex-col justify-center items-center relative overflow-hidden border-b lg:border-b-0 lg:border-r border-slate-200 min-h-[350px]">
            <div className="absolute top-4 left-4 bg-white/95 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-500 z-10 shadow-xs">
              Original: <span className="text-indigo-600 font-bold">{naturalWidth} px</span> × <span className="text-indigo-600 font-bold">{naturalHeight} px</span>
            </div>

            <div className="relative max-w-full max-h-[450px] border border-slate-200 rounded-xl overflow-hidden shadow-sm flex items-center justify-center bg-slate-150">
              <img
                src={getProxiedUrl(image.url)}
                alt="Optimize Canvas Target"
                className="max-h-[380px] object-contain select-none opacity-40 blur-[1px]"
                crossOrigin="anonymous"
              />
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <img
                  src={getProxiedUrl(image.url)}
                  alt="Optimize Cropped Target"
                  className="max-h-[380px] object-contain select-none z-5"
                  crossOrigin="anonymous"
                />
              </div>

              {/* Overlapping Virtual cropping HUD overlay */}
              <div 
                style={{
                  position: "absolute",
                  left: `${(cropX / naturalWidth) * 100}%`,
                  top: `${(cropY / naturalHeight) * 100}%`,
                  width: `${(cropWidth / naturalWidth) * 100}%`,
                  height: `${(cropHeight / naturalHeight) * 100}%`,
                  border: "2px dashed #4f46e5",
                  boxShadow: "0 0 0 9999px rgba(241, 245, 249, 0.45)",
                  pointerEvents: "none"
                }}
                className="animate-pulse z-10"
              >
                <div className="absolute bottom-2 right-2 bg-indigo-600 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-white shadow-md">
                  Crop: {cropWidth} × {cropHeight}
                </div>
              </div>
            </div>

            {/* Slider to adjust the cropping position manually */}
            <div className="w-full max-w-sm mt-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500 font-semibold font-mono">
                <span>Crop Width offset ({cropWidth}px)</span>
                <span className="text-indigo-600">{Math.round((cropWidth / naturalWidth) * 100)}%</span>
              </div>
              <input
                type="range"
                min={Math.floor(naturalWidth * 0.1)}
                max={naturalWidth}
                value={cropWidth}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setCropWidth(val);
                  // Safeguard coordinate bounds
                  if (cropX + val > naturalWidth) {
                    setCropX(naturalWidth - val);
                  }
                  // Set new default targeted resolution scale
                  setTargetWidth(val);
                }}
                className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />

              <div className="flex justify-between text-slate-500 font-semibold font-mono mt-1">
                <span>Crop Height offset ({cropHeight}px)</span>
                <span className="text-indigo-600">{Math.round((cropHeight / naturalHeight) * 100)}%</span>
              </div>
              <input
                type="range"
                min={Math.floor(naturalHeight * 0.1)}
                max={naturalHeight}
                value={cropHeight}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setCropHeight(val);
                  if (cropY + val > naturalHeight) {
                    setCropY(naturalHeight - val);
                  }
                }}
                className="w-full accent-indigo-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
              />

              {/* Adjust focal reposition offsets */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Offset X Axis</label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, naturalWidth - cropWidth)}
                    value={cropX}
                    onChange={(e) => setCropX(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 font-mono">Offset Y Axis</label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, naturalHeight - cropHeight)}
                    value={cropY}
                    onChange={(e) => setCropY(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right panel: Preset, Resizer, and format configurations */}
          <div className="lg:col-span-5 p-6 flex flex-col justify-between overflow-y-auto max-h-[550px] lg:max-h-none space-y-6 bg-white">
            
            <div className="space-y-6">
              {/* Presets Grid */}
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-wider font-bold text-indigo-600 flex items-center gap-1.5 font-mono">
                  <Crop className="w-3.5 h-3.5" />
                  Social Media Viewports & Presets
                </span>
                
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  <button
                    onClick={() => applyPreset("custom")}
                    className={`px-3 py-2 text-left rounded-xl transition-all text-xs flex justify-between items-center border ${
                      activePreset === "custom"
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 font-semibold"
                        : "bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700"
                    }`}
                  >
                    <span>Reset / Full Custom</span>
                    {activePreset === "custom" && <Check className="w-3 h-3 text-indigo-600" />}
                  </button>
                  
                  {CROP_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className={`px-3 py-2 text-left rounded-xl transition-all text-xs flex flex-col gap-0.5 border ${
                        activePreset === p.id
                          ? "bg-indigo-55 border-indigo-200 text-indigo-700 font-semibold"
                          : "bg-slate-50 border-slate-200 hover:border-slate-350 text-slate-700"
                      }`}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{p.width} × {p.height}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optimization Parameters */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <span className="text-xs uppercase tracking-wider font-bold text-emerald-600 flex items-center gap-1.5 font-mono">
                  <Sliders className="w-3.5 h-3.5" />
                  Optimization Configs
                </span>

                {/* Target Width Input */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-slate-600 font-medium">Target Output Width:</label>
                    <span className="text-[11px] text-slate-400 font-mono">Height: {Math.round(cropHeight * (targetWidth / cropWidth))}px (Auto scale)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={targetWidth}
                      onChange={(e) => handleScaleWidthChange(parseInt(e.target.value) || 1200)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-55/20 font-mono"
                      min={10}
                      max={12000}
                    />
                    <span className="text-slate-400 text-xs px-2 select-none">Pixels</span>
                  </div>
                </div>

                {/* format select */}
                <div className="grid grid-cols-3 gap-2">
                  {(["jpeg", "png", "webp"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setFormat(fmt)}
                      className={`py-2 px-3 text-xs font-mono rounded-xl border text-center transition-all ${
                        format === fmt
                          ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-800"
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Quality control for Jpeg / Webp */}
                {format !== "png" && (
                  <div className="space-y-2 pt-2">
                    <div className="flex justify-between text-xs text-slate-600 font-medium">
                      <span>Compression Quality:</span>
                      <span className="text-indigo-600 font-bold font-mono">{Math.round(quality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={quality}
                      onChange={(e) => setQuality(parseFloat(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>Maximum compression size</span>
                      <span>Lossless original fidelity</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Estimated Export Stats */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3 pt-3 mt-4">
              <div className="flex justify-between text-xs border-b border-slate-200 pb-2">
                <span className="text-slate-500">Target Type:</span>
                <span className="font-semibold text-slate-700 font-mono">image/{format}</span>
              </div>
              <div className="flex justify-between text-xs border-b border-slate-200 pb-2">
                <span className="text-slate-500">Optimized Bounds:</span>
                <span className="font-semibold text-slate-700 font-mono">
                  {targetWidth} × {Math.round(cropHeight * (targetWidth / cropWidth))} px
                </span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-indigo-600 font-bold">Estimated output size:</span>
                <span className="font-bold text-indigo-700 font-mono bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-xs">{estimatedSize}</span>
              </div>

              <button
                onClick={handleProcessAndDownload}
                disabled={isProcessing}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 mt-2"
              >
                {isProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Rendering on Canvas...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Crop, Optimize & Save
                  </>
                )}
              </button>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
