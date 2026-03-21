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

/* ─── Shared badges ──────────────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider bg-cyan-950/50 text-cyan-400 ring-1 ring-cyan-500/20">
      {type.replace("hash_", "")}
    </span>
  );
}

function SevBadge({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  const ringCls =
    sev.label === "Critical" ? "ring-red-500/30 bg-red-950/50 text-red-400" :
    sev.label === "High"     ? "ring-orange-500/30 bg-orange-950/50 text-orange-400" :
    sev.label === "Medium"   ? "ring-amber-500/30 bg-amber-950/50 text-amber-400" :
    sev.label === "Low"      ? "ring-blue-500/30 bg-blue-950/50 text-blue-400" :
                               "ring-slate-500/30 bg-slate-800/50 text-slate-400";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ring-1 ${ringCls}`}>
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${sev.dotCls}`} />
      {sev.label}
    </span>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */
export default function WatchlistPage() {
  const [data,    setData]    = useState<WatchedIOC[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetchApi("/api/workspace/watchlist");
        const items: WatchedIOC[] = Array.isArray(res) ? res : (res?.items ?? []);
        setData(items);
      } catch (err) {
        console.error(err);
        setError("Failed to load watchlist.");
      } finally { setLoading(false); }
    }
    load();
  }, []);

  const remove = async (e: React.MouseEvent, iocId: string) => {
    e.preventDefault(); e.stopPropagation();
    setData((prev) => prev.filter((item) => item.id !== iocId));
    try {
      await fetchApi(`/api/workspace/watchlist/${iocId}`, { method: "DELETE" });
    } catch { /* optimistic */ }
  };

  const handleExportCSV = () => {
    const headers = ["Indicator", "Type", "Severity Score", "Severity Label", "Tags", "First Seen", "Last Seen"];
    const rows = data.map((item) => [
      `"${item.value}"`, item.type, item.severity ?? "",
      getSeverity(item.severity).label,
      (item.tags ?? []).map((t) => t.tag).join("; "),
      formatDate(item.first_seen), formatDate(item.last_seen),
    ]);
    const csv  = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
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

  return (
    <div className="space-y-2 animate-in fade-in duration-400">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-cyan-400" fill="currentColor" />
          <div>
            <h1 className="text-sm font-bold uppercase tracking-widest font-mono text-slate-200">Analyst Watchlist</h1>
            <p className="text-[9px] mt-0.5 text-slate-600 uppercase tracking-wider">Personal indicators under active monitoring</p>
          </div>
        </div>

        {/* Export buttons — compact top-right row */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", color: "#22d3ee" }}
          >
            <Download className="w-2.5 h-2.5" /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={data.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", color: "#22d3ee" }}
          >
            <FileJson className="w-2.5 h-2.5" /> JSON
          </button>
        </div>
      </div>

      {/* ── Severity stats strip ─────────────────────────────────────────── */}
      {!loading && data.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {(["Critical", "High", "Medium", "Low"] as const).map((label) => {
            const count = data.filter((ioc) => getSeverity(ioc.severity).label === label).length;
            if (count === 0) return null;
            const color =
              label === "Critical" ? { bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.2)",  text: "#f87171" } :
              label === "High"     ? { bg: "rgba(249,115,22,0.08)", border: "rgba(249,115,22,0.2)", text: "#fb923c" } :
              label === "Medium"   ? { bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)", text: "#fbbf24" } :
                                     { bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.2)",  text: "#60a5fa" };
            return (
              <div
                key={label}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono font-bold"
                style={{ background: color.bg, border: `1px solid ${color.border}`, color: color.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color.text, boxShadow: `0 0 4px ${color.text}80` }} />
                {count} {label}
              </div>
            );
          })}
          <span className="ml-auto text-[9px] font-mono text-slate-700">{data.length} total</span>
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "rgba(10,16,32,0.7)", border: "1px solid rgba(34,211,238,0.1)" }}
      >
        {error && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        )}

        {!loading && !error && data.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Shield className="w-10 h-10 text-slate-800" />
            <div className="text-sm font-mono font-bold text-slate-500">Watchlist is empty</div>
            <div className="text-[10px] text-slate-700 text-center max-w-[240px]">
              Bookmark IOCs from their detail pages to track them here.
            </div>
            <Link
              href="/search"
              className="mt-1 px-3 py-1.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all"
              style={{ background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)", color: "#22d3ee" }}
            >
              Search IOCs →
            </Link>
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(34,211,238,0.08)", background: "rgba(34,211,238,0.02)" }}>
                  {["Indicator", "Type", "Score", "Severity", "Tags", "Last Seen", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[8px] uppercase tracking-widest font-bold text-slate-700 font-mono">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((ioc) => {
                  const sev = getSeverity(ioc.severity);
                  const sevColor =
                    sev.label === "Critical" ? "#ef4444" :
                    sev.label === "High"     ? "#f97316" :
                    sev.label === "Medium"   ? "#f59e0b" : "#3b82f6";
                  return (
                    <tr
                      key={ioc.id}
                      className="group transition-colors"
                      style={{ borderBottom: "1px solid rgba(34,211,238,0.04)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(8,28,44,0.8)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/iocs/${ioc.id}`}
                          className="font-mono text-[11px] font-medium text-cyan-300 hover:text-cyan-200 hover:underline truncate max-w-[220px] block transition-colors"
                        >
                          {ioc.value}
                        </Link>
                      </td>
                      <td className="px-3 py-1.5"><TypeBadge type={ioc.type} /></td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${((ioc.severity ?? 0) / 10) * 100}%`, background: sevColor, boxShadow: `0 0 4px ${sevColor}60` }}
                            />
                          </div>
                          <span className="tabular-nums font-mono text-[10px] text-slate-500">{(ioc.severity ?? 0).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5"><SevBadge score={ioc.severity} /></td>
                      <td className="px-3 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {(ioc.tags ?? []).slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="px-1.5 py-0.5 rounded text-[8px] font-mono"
                              style={{ background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.15)", color: "#67e8f9" }}
                            >
                              {t.tag}
                            </span>
                          ))}
                          {(ioc.tags ?? []).length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-700">
                              +{(ioc.tags ?? []).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-slate-600">{formatRelativeTime(ioc.last_seen)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <button
                          onClick={(e) => remove(e, ioc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all text-slate-700 hover:text-red-400"
                          title="Remove from watchlist"
                          style={{ border: "1px solid transparent" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(239,68,68,0.3)")}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
                        >
                          <BookmarkMinus className="w-3 h-3" />
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
