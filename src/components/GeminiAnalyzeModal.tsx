import React, { useState, useEffect } from "react";
import { X, Sparkles, Loader2, RefreshCw, Palette, Tag, AlignLeft, CheckCircle } from "lucide-react";
import { getProxiedUrl } from "../utils/imageEditor";

interface GeminiAnalyzeModalProps {
  imageUrl: string;
  onClose: () => void;
  onTagsExtracted?: (tags: string[]) => void;
}

export default function GeminiAnalyzeModal({ imageUrl, onClose, onTagsExtracted }: GeminiAnalyzeModalProps) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const performAIAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      let token = "";
      try {
        const saved = localStorage.getItem("imgrap_logged_user");
        if (saved) {
          const user = JSON.parse(saved);
          token = user.token || "";
        }
      } catch (_) {}

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({
          imageUrl,
          prompt: "Identify: 1. A short creative title for this photo (e.g. 'Golden Hour Forest'). 2. Exactly 5 descriptive word tags (separated by commas). 3. Brief summary of elements, mood, and dominant primary colors."
        }),
      });

      if (!response.ok) {
        throw new Error("AI analysis timed out or failed to parse this image remote format.");
      }

      const data = await response.json();
      if (data.success && data.analysis) {
        setAnalysis(data.analysis);
        // Attempt parsing 5 tags if onTagsExtracted provided
        if (onTagsExtracted) {
          try {
            // Find commas or keywords block in response
            const tagLines = data.analysis.split("\n");
            for (const line of tagLines) {
              if (line.includes(",") && (line.toLowerCase().includes("tags") || line.includes("1.") || line.includes("2."))) {
                const parts = line.split(":")[1] || line;
                const cleanTags = parts.split(",").map((t: string) => t.replace(/[^a-zA-Z]/g, "").trim()).filter(Boolean);
                if (cleanTags.length >= 3) {
                  onTagsExtracted(cleanTags);
                  break;
                }
              }
            }
          } catch (_) {}
        }
      } else {
        throw new Error(data.error || "Analysis failed.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred contacting the Gemini AI engine.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performAIAnalysis();
  }, [imageUrl]);

  return (
    <div id="gemini-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-fade-in">
      <div className="relative bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl text-slate-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 fill-indigo-600/10" />
            <h3 className="font-display font-bold text-lg text-slate-950">Gemini AI Image Insights</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Image Preview Side */}
            <div className="bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center min-h-[220px]">
              <img
                src={getProxiedUrl(imageUrl)}
                alt="AI Analysis Target"
                className="max-h-[300px] object-contain w-full"
                crossOrigin="anonymous"
              />
            </div>

            {/* Analysis Side */}
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-full py-12 text-center text-slate-400">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Gemini is scanning details...</p>
                  <p className="text-xs text-slate-500 mt-1">Inspecting color palettes, context keywords, and layout context</p>
                </div>
              ) : error ? (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl text-center space-y-3">
                  <p className="text-sm text-rose-700 font-medium">{error}</p>
                  <button
                    onClick={performAIAnalysis}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-800 text-xs font-semibold rounded-lg transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Analysis
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-indigo-600 border-b border-slate-100 pb-2">
                    <AlignLeft className="w-4 h-4" />
                    <span className="text-xs font-mono tracking-wider font-bold">AI OBSERVATIONS</span>
                  </div>
                  
                  {analysis ? (
                    <div className="text-sm text-slate-705 leading-relaxed bg-slate-50 border border-slate-200 p-4 rounded-xl font-sans whitespace-pre-line max-h-[280px] overflow-y-auto custom-scrollbar">
                      {analysis}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No analysis data returned.</p>
                  )}

                  <div className="flex items-center gap-2 bg-indigo-50 text-indigo-800 text-xs p-3 rounded-lg border border-indigo-100">
                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Attributes evaluated server-side securely. Perfect for automatic SEO keyword tags or gallery captions.</span>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-sm font-semibold text-slate-800 rounded-xl border border-slate-200 transition-all"
          >
            Close Insights
          </button>
        </div>

      </div>
    </div>
  );
}
