"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatRelativeTime, formatDate } from "@/lib/utils";
import {
  Bookmark, Loader2, Download, FileJson, BookmarkMinus,
  AlertTriangle, Shield,
} from "lucide-react";
import Link from "next/link";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface WatchedIOC {
  id: string;
  value: string;
  type: string;
  severity: number | null;
  first_seen: string;
  last_seen: string;
  source_count: number;
  is_active: boolean;
  tags?: { id: string; tag: string }[];
}

/* ─── Subcomponents ─────────────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-cyan-950/50 text-cyan-300 ring-1 ring-cyan-500/20">
      {type.replace("hash_", "")}
    </span>
  );
}

function SevBadge({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  const ringCls =
    sev.label === "Critical" ? "ring-red-500/30 bg-red-950/40 text-red-400" :
    sev.label === "High"     ? "ring-orange-500/30 bg-orange-950/40 text-orange-400" :
    sev.label === "Medium"   ? "ring-amber-500/30 bg-amber-950/40 text-amber-400" :
    sev.label === "Low"      ? "ring-blue-500/30 bg-blue-950/40 text-blue-400" :
                               "ring-slate-500/30 bg-slate-800/40 text-slate-400";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-semibold ring-1 ${ringCls}`}>
      <span className={`w-1 h-1 rounded-full ${sev.dotCls}`} />
      {sev.label}
    </span>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */
export default function WatchlistPage() {
  const [data, setData] = useState<WatchedIOC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi("/api/workspace/watchlist");
        // Handle both { items: [] } and plain array
        const items: WatchedIOC[] = Array.isArray(res) ? res : (res?.items ?? []);
        setData(items);
      } catch (err) {
        console.error(err);
        setError("Failed to load watchlist.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const remove = async (e: React.MouseEvent, iocId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setData((prev) => prev.filter((item) => item.id !== iocId));
    try {
      await fetchApi(`/api/workspace/watchlist/${iocId}`, { method: "DELETE" });
    } catch { /* optimistic already applied */ }
  };

  /* ── Exports ─────────────────────────────────────────────────────────── */
  const handleExportCSV = () => {
    const headers = ["Indicator", "Type", "Severity Score", "Severity Label", "Tags", "First Seen", "Last Seen"];
    const rows = data.map((item) => [
      `"${item.value}"`,
      item.type,
      item.severity ?? "",
      getSeverity(item.severity).label,
      (item.tags ?? []).map((t) => t.tag).join("; "),
      formatDate(item.first_seen),
      formatDate(item.last_seen),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `threatlens-watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const link = document.createElement("a");
    link.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    link.download = `threatlens-watchlist-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4 animate-in fade-in duration-400">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-cyan-400" fill="currentColor" />
            Analyst Watchlist
          </h1>
          <p className="text-xs mt-0.5 text-slate-500">Personal indicators under active monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 transition-all bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={data.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 transition-all bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
          >
            <FileJson className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && data.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {(["Critical", "High", "Medium", "Low"] as const).map((label) => {
            const count = data.filter((ioc) => getSeverity(ioc.severity).label === label).length;
            if (count === 0) return null;
            const sev = getSeverity(label === "Critical" ? 9.5 : label === "High" ? 7.5 : label === "Medium" ? 5.0 : 2.0);
            return (
              <div key={label} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-medium ring-1 ${sev.cls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sev.dotCls}`} />
                {count} {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
        {error && (
          <div className="flex items-center gap-2 px-4 py-8 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4" />{error}
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        )}
        {!loading && !error && data.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-xs text-slate-500">
            <Shield className="w-10 h-10 opacity-15" />
            <div className="text-sm font-heading font-medium text-slate-300">Watchlist is empty</div>
            <div className="text-center max-w-[260px]">Bookmark IOCs from their detail pages to track them here.</div>
            <Link href="/search" className="mt-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all bg-cyan-600 hover:bg-cyan-500 text-white">
              Search IOCs →
            </Link>
          </div>
        )}
        {!loading && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/60">
                  {["Indicator", "Type", "Score", "Severity", "Tags", "Last Seen", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((ioc) => {
                  const sev = getSeverity(ioc.severity);
                  return (
                    <tr
                      key={ioc.id}
                      className="group transition-colors hover:bg-cyan-950/30 border-b border-slate-800/40 last:border-b-0"
                    >
                      <td className="px-4 py-2">
                        <Link href={`/iocs/${ioc.id}`} className="font-mono font-medium hover:underline truncate max-w-[200px] block text-cyan-300">
                          {ioc.value}
                        </Link>
                      </td>
                      <td className="px-4 py-2"><TypeBadge type={ioc.type} /></td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1 rounded-full overflow-hidden bg-slate-800">
                            <div className={`h-full rounded-full ${sev.barCls}`} style={{ width: `${((ioc.severity ?? 0) / 10) * 100}%` }} />
                          </div>
                          <span className="tabular-nums font-mono text-slate-300">{(ioc.severity ?? 0).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2"><SevBadge score={ioc.severity} /></td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {(ioc.tags ?? []).slice(0, 3).map((t) => (
                            <span key={t.id} className="px-1.5 py-0.5 rounded-full text-[9px] ring-1 ring-cyan-500/20 bg-cyan-950/40 text-cyan-400">
                              {t.tag}
                            </span>
                          ))}
                          {(ioc.tags ?? []).length > 3 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-slate-800 text-slate-500">
                              +{(ioc.tags ?? []).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-500">{formatRelativeTime(ioc.last_seen)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={(e) => remove(e, ioc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all text-slate-500 hover:text-red-400"
                          title="Remove from watchlist"
                        >
                          <BookmarkMinus className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
