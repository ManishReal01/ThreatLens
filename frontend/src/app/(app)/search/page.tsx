"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, severityFilterToParams, formatRelativeTime } from "@/lib/utils";
import { Search, Loader2, ChevronLeft, ChevronRight, Download, FileJson, X } from "lucide-react";
import Link from "next/link";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface IOCListItem {
  id: string;
  value: string;
  type: string;
  severity: number | null;
  first_seen: string;
  last_seen: string;
  source_count: number;
  is_active: boolean;
}
interface PaginatedResponse {
  items: IOCListItem[];
  total: number;
  page: number;
  pages: number;
}

/* ─── Shared badge components ────────────────────────────────────────────── */
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
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ring-1 leading-none ${ringCls}`}>
      <span className={`w-1 h-1 rounded-full flex-shrink-0 ${sev.dotCls}`} />
      {sev.label}
    </span>
  );
}

const SEL = "h-7 px-2.5 text-[11px] rounded outline-none cursor-pointer appearance-none transition-colors";
const SEL_STYLE = {
  background: "rgba(7,13,24,0.8)",
  border: "1px solid rgba(34,211,238,0.12)",
  color: "#94a3b8",
};
const SEL_FOCUS_STYLE = {
  background: "rgba(7,13,24,0.9)",
  border: "1px solid rgba(34,211,238,0.4)",
  color: "#e2e8f0",
};

/* ─── Main search component ─────────────────────────────────────────────── */
function SearchContent() {
  const router     = useRouter();
  const searchParams = useSearchParams();
  const pathname   = usePathname();

  const [query,    setQuery]    = useState(searchParams.get("q")        || "");
  const [type,     setType]     = useState(searchParams.get("type")     || "");
  const [severity, setSeverity] = useState(searchParams.get("severity") || "");

  const [results, setResults] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (query)    params.set("q",        query);
    if (type)     params.set("type",     type);
    if (severity) params.set("severity", severity);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [query, type, severity, pathname, router]);

  const clearFilters = () => {
    setQuery(""); setType(""); setSeverity("");
    router.push(pathname);
  };

  const hasFilters = !!(query || type || severity);

  useEffect(() => {
    async function fetchData() {
      setLoading(true); setError(null);
      try {
        const params = new URLSearchParams();
        const q    = searchParams.get("q");
        const t    = searchParams.get("type");
        const sev  = searchParams.get("severity");
        const page = searchParams.get("page") || "1";
        if (q)   params.set("q",    q);
        if (t)   params.set("type", t);
        if (sev) { const sp = severityFilterToParams(sev); Object.entries(sp).forEach(([k, v]) => params.set(k, v)); }
        params.set("page",      page);
        params.set("page_size", "25");
        const res = await fetchApi(`/api/iocs?${params.toString()}`);
        setResults(res);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch results. Ensure the API is running.");
        setResults(null);
      } finally { setLoading(false); }
    }
    fetchData();
  }, [searchParams]);

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  const handleExportCSV = () => {
    if (!results) return;
    const headers = ["Indicator", "Type", "Severity Score", "Severity Label", "Sources", "Last Seen"];
    const rows = results.items.map((item) => [
      `"${item.value}"`, item.type, item.severity ?? "",
      getSeverity(item.severity).label, item.source_count,
      new Date(item.last_seen).toISOString(),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `threatlens-iocs-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    if (!results) return;
    const link = document.createElement("a");
    link.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results.items, null, 2));
    link.download = `threatlens-iocs-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  return (
    <div className="space-y-2 animate-in fade-in duration-400">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest font-mono text-slate-200">IOC Search</h1>
          <p className="text-[9px] mt-0.5 text-slate-600 uppercase tracking-wider">All threat intelligence feeds</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExportCSV}
            disabled={!results || results.items.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", color: "#22d3ee" }}
          >
            <Download className="w-2.5 h-2.5" /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={!results || results.items.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", color: "#22d3ee" }}
          >
            <FileJson className="w-2.5 h-2.5" /> JSON
          </button>
        </div>
      </div>

      {/* ── Filter bar ── all in one horizontal row ──────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg flex-wrap"
        style={{ background: "rgba(10,16,32,0.7)", border: "1px solid rgba(34,211,238,0.1)" }}
      >
        {/* Search input */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            placeholder="IPs · domains · hashes · URLs…"
            className="w-full h-7 pl-7 pr-3 rounded text-[11px] font-mono outline-none transition-all placeholder:text-slate-700"
            style={{ background: "rgba(7,13,24,0.8)", border: "1px solid rgba(34,211,238,0.12)", color: "#e2e8f0" }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.4)")}
            onBlur={(e)  => (e.target.style.borderColor = "rgba(34,211,238,0.12)")}
          />
        </div>

        {/* Type select */}
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={SEL}
          style={SEL_STYLE}
          onFocus={(e) => Object.assign(e.target.style, SEL_FOCUS_STYLE)}
          onBlur={(e)  => Object.assign(e.target.style, SEL_STYLE)}
        >
          <option value="">All Types</option>
          <option value="ip">IP</option>
          <option value="domain">Domain</option>
          <option value="url">URL</option>
          <option value="hash_md5">MD5</option>
          <option value="hash_sha256">SHA256</option>
        </select>

        {/* Severity select */}
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className={SEL}
          style={SEL_STYLE}
          onFocus={(e) => Object.assign(e.target.style, SEL_FOCUS_STYLE)}
          onBlur={(e)  => Object.assign(e.target.style, SEL_STYLE)}
        >
          <option value="">All Severities</option>
          <option value="critical">Critical ≥8.5</option>
          <option value="high">High 7.0–8.9</option>
          <option value="medium">Medium 4.0–6.9</option>
          <option value="low">Low &lt;4.0</option>
        </select>

        {/* Apply */}
        <button
          onClick={applyFilters}
          className="h-7 flex items-center gap-1.5 px-3 rounded text-[10px] font-bold uppercase tracking-wider transition-all"
          style={{ background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee" }}
        >
          <Search className="w-2.5 h-2.5" />
          Search
        </button>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="h-7 flex items-center gap-1 px-2.5 rounded text-[10px] font-mono uppercase tracking-wider transition-all"
            style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
          >
            <X className="w-2.5 h-2.5" /> Clear
          </button>
        )}

        {/* Result count */}
        {results && (
          <span className="ml-auto text-[9px] font-mono text-slate-600 tabular-nums">
            {results.total.toLocaleString()} result{results.total !== 1 ? "s" : ""}
            {results.pages > 1 && ` · p${results.page}/${results.pages}`}
          </span>
        )}
      </div>

      {/* ── Results table ─────────────────────────────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "rgba(10,16,32,0.7)", border: "1px solid rgba(34,211,238,0.1)" }}
      >
        {error && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-red-400">{error}</div>
        )}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        )}
        {!loading && !error && results && results.items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <Search className="w-7 h-7 text-slate-700" />
            <p className="text-[10px] uppercase tracking-wider text-slate-600">No indicators match your search</p>
          </div>
        )}

        {!loading && results && results.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(34,211,238,0.08)", background: "rgba(34,211,238,0.02)" }}>
                  {["Indicator", "Type", "Score", "Severity", "Sources", "Last Seen"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-[8px] uppercase tracking-widest font-bold text-slate-600 font-mono">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.items.map((ioc) => {
                  const sev = getSeverity(ioc.severity);
                  const sevColor =
                    sev.label === "Critical" ? "#ef4444" :
                    sev.label === "High"     ? "#f97316" :
                    sev.label === "Medium"   ? "#f59e0b" : "#3b82f6";
                  return (
                    <tr
                      key={ioc.id}
                      className="group transition-colors cursor-pointer"
                      style={{ borderBottom: "1px solid rgba(34,211,238,0.04)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(8,28,44,0.8)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="px-3 py-1.5">
                        <Link
                          href={`/iocs/${ioc.id}`}
                          className="font-mono text-[11px] font-medium text-cyan-300 hover:text-cyan-200 hover:underline truncate max-w-[280px] block transition-colors"
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
                          <span className="tabular-nums font-mono text-[10px] text-slate-400">{(ioc.severity ?? 0).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5"><SevBadge score={ioc.severity} /></td>
                      <td className="px-3 py-1.5 tabular-nums text-[10px] font-mono text-slate-600">{ioc.source_count}</td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-slate-600">{formatRelativeTime(ioc.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && results && results.pages > 1 && (
          <div
            className="flex items-center justify-between px-3 py-2"
            style={{ borderTop: "1px solid rgba(34,211,238,0.07)" }}
          >
            <button
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
              style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)", color: "#94a3b8" }}
            >
              <ChevronLeft className="w-3 h-3" /> Prev
            </button>
            <span className="text-[9px] font-mono text-slate-600">{currentPage} / {results.pages}</span>
            <button
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage >= results.pages}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-mono uppercase tracking-wider disabled:opacity-30 transition-all"
              style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.12)", color: "#94a3b8" }}
            >
              Next <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-2">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-10" />
          <div className="skeleton h-72" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
