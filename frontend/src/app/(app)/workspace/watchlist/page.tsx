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
const TYPE_COLORS: Record<string, string> = {
  ipv4:        "bg-sky-500/10 text-sky-400 border-sky-500/20",
  domain:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
  url:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  hash_md5:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha1:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha256: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? "bg-muted/20 text-muted-foreground border-muted/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${cls}`}>
      {type.replace("hash_", "")}
    </span>
  );
}

function SevBadge({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${sev.cls}`}>
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
          <h1 className="text-2xl font-bold font-heading tracking-tight flex items-center gap-2" style={{ color: "var(--foreground)" }}>
            <Bookmark className="w-5 h-5" style={{ color: "var(--primary)" }} fill="currentColor" />
            Analyst Watchlist
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Personal indicators under active monitoring
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={data.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-all"
            style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={data.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-all"
            style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            <FileJson className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && data.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {(["Critical", "High", "Medium", "Low"] as const).map((label) => {
            const count = data.filter((ioc) => getSeverity(ioc.severity).label === label).length;
            if (count === 0) return null;
            const sev = getSeverity(label === "Critical" ? 9.5 : label === "High" ? 7.5 : label === "Medium" ? 5.0 : 2.0);
            return (
              <div
                key={label}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-medium border ${sev.cls}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${sev.dotCls}`} />
                {count} {label}
              </div>
            );
          })}
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-8 text-xs"
            style={{ color: "#f87171" }}
          >
            <AlertTriangle className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--primary)" }} />
          </div>
        )}

        {/* Empty */}
        {!loading && !error && data.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-40 gap-3 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Shield className="w-10 h-10 opacity-15" />
            <div className="text-sm font-heading font-medium" style={{ color: "var(--foreground)" }}>
              Watchlist is empty
            </div>
            <div className="text-center max-w-[260px]">
              Bookmark IOCs from their detail pages to track them here.
            </div>
            <Link
              href="/search"
              className="mt-1 px-3 py-1.5 rounded text-xs font-medium transition-all"
              style={{
                background: "rgba(56,189,248,0.10)",
                border: "1px solid rgba(56,189,248,0.25)",
                color: "var(--primary)",
              }}
            >
              Search IOCs →
            </Link>
          </div>
        )}

        {/* Data */}
        {!loading && data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid var(--border)` }}>
                  {["Indicator", "Type", "Score", "Severity", "Tags", "Last Seen", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider font-semibold"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((ioc, i) => {
                  const sev = getSeverity(ioc.severity);
                  return (
                    <tr
                      key={ioc.id}
                      className="group transition-colors"
                      style={{
                        borderBottom: i < data.length - 1 ? `1px solid var(--border)` : undefined,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/iocs/${ioc.id}`}
                          className="font-mono font-medium hover:underline truncate max-w-[200px] block"
                          style={{ color: "var(--primary)", fontFamily: "var(--font-mono)" }}
                        >
                          {ioc.value}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <TypeBadge type={ioc.type} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-12 h-1.5 rounded-full overflow-hidden"
                            style={{ background: "var(--muted)" }}
                          >
                            <div
                              className={`h-full rounded-full ${sev.barCls}`}
                              style={{ width: `${((ioc.severity ?? 0) / 10) * 100}%` }}
                            />
                          </div>
                          <span className="tabular-nums font-mono" style={{ color: "var(--foreground)" }}>
                            {(ioc.severity ?? 0).toFixed(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <SevBadge score={ioc.severity} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(ioc.tags ?? []).slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="px-1.5 py-0.5 rounded text-[9px]"
                              style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.2)", color: "var(--primary)" }}
                            >
                              {t.tag}
                            </span>
                          ))}
                          {(ioc.tags ?? []).length > 3 && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px]"
                              style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                            >
                              +{(ioc.tags ?? []).length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {formatRelativeTime(ioc.last_seen)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={(e) => remove(e, ioc.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all"
                          style={{ color: "var(--muted-foreground)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
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
