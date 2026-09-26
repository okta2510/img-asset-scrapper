import React from "react";
import { Trash2, History, ArrowUpRight, Search, Globe, Download, FileJson, FileText } from "lucide-react";
import { ScrapeHistoryItem } from "../types";

interface HistoryPanelProps {
  history: ScrapeHistoryItem[];
  onSelect: (item: ScrapeHistoryItem) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export default function HistoryPanel({ history, onSelect, onDelete, onClear }: HistoryPanelProps) {
  const exportAsTxt = () => {
    if (history.length === 0) return;
    const lines = history.map(h => `${h.type.toUpperCase()} | ${h.timestamp} | Query: ${h.query} | Found: ${h.imageCount} imgs`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "images_scraper_query_history.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportAsJson = () => {
    if (history.length === 0) return;
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "images_scraper_query_history.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div id="history-panel" className="bg-white border border-slate-200 rounded-3xl p-6 flex flex-col h-full text-slate-800 shadow-sm">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-600" />
          <h3 className="font-display font-bold text-lg text-slate-900">Activity Log</h3>
        </div>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="text-xs text-rose-600 hover:text-rose-700 font-semibold transition-colors flex items-center gap-1"
            title="Clear all local history logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pr-1 max-h-[350px] md:max-h-[500px] space-y-3 custom-scrollbar">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-slate-400">
            <History className="w-8 h-8 opacity-30 mb-2 stroke-1" />
            <p className="text-sm font-medium">No activity recorded yet.</p>
            <p className="text-xs mt-1 max-w-[200px] text-slate-500">Crawl page links or search keyword queries to log events.</p>
          </div>
        ) : (
          history.map((item) => (
            <div
              key={item.id}
              className="group relative bg-slate-50 hover:bg-slate-100/75 border border-slate-200 hover:border-indigo-300 rounded-xl p-3.5 transition-all flex items-center justify-between cursor-pointer"
              onClick={() => onSelect(item)}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className={`p-2 rounded-lg mt-0.5 ${item.type === "scrape" ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}>
                  {item.type === "scrape" ? (
                    <Globe className="w-4 h-4" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-slate-400 font-mono">
                    {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="text-sm font-semibold text-slate-800 truncate pr-4" title={item.query}>
                    {item.query}
                  </p>
                  <span className="inline-flex items-center text-xs mt-1 font-medium px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-600">
                    {item.imageCount} images found
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                  }}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                  title="Remove this query log"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="p-1 text-indigo-600">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-6 pt-4 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-400 uppercase font-mono tracking-wider font-bold mb-1">Export Workspace History</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={exportAsTxt}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 rounded-xl border border-slate-200 transition-all"
            >
              <FileText className="w-3.5 h-3.5 text-indigo-600" />
              Spread TXT
            </button>
            <button
              onClick={exportAsJson}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 rounded-xl border border-slate-200 transition-all"
            >
              <FileJson className="w-3.5 h-3.5 text-emerald-600" />
              Spread JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
