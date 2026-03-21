"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, severityFilterToParams, formatRelativeTime } from "@/lib/utils";
import { Search, Loader2, ChevronLeft, ChevronRight, Download, FileJson, Filter, X } from "lucide-react";
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

/* ─── Main search component ─────────────────────────────────────────────── */
function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [severity, setSeverity] = useState(searchParams.get("severity") || "");

  const [results, setResults] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (severity) params.set("severity", severity);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, [query, type, severity, pathname, router]);

  const clearFilters = () => {
    setQuery("");
    setType("");
    setSeverity("");
    router.push(pathname);
  };

  const hasFilters = !!(query || type || severity);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // Build query params — severity filter maps to numeric range
        const params = new URLSearchParams();
        const q = searchParams.get("q");
        const t = searchParams.get("type");
        const sev = searchParams.get("severity");
        const page = searchParams.get("page") || "1";

        if (q) params.set("q", q);
        if (t) params.set("type", t);
        if (sev) {
          const sevParams = severityFilterToParams(sev);
          Object.entries(sevParams).forEach(([k, v]) => params.set(k, v));
        }
        params.set("page", page);
        params.set("page_size", "25");

        const res = await fetchApi(`/api/iocs?${params.toString()}`);
        setResults(res);
      } catch (err) {
        console.error(err);
        setError("Failed to fetch results. Ensure the API is running.");
        setResults(null);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [searchParams]);

  const changePage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const currentPage = parseInt(searchParams.get("page") || "1", 10);

  /* ── Export ──────────────────────────────────────────────────────────── */
  const handleExportCSV = () => {
    if (!results) return;
    const headers = ["Indicator", "Type", "Severity Score", "Severity Label", "Sources", "Last Seen"];
    const rows = results.items.map((item) => [
      `"${item.value}"`,
      item.type,
      item.severity ?? "",
      getSeverity(item.severity).label,
      item.source_count,
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

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-4 animate-in fade-in duration-400">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            IOC Search
          </h1>
          <p className="text-xs mt-0.5 text-slate-500">Search across all threat intelligence feeds</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!results || results.items.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 transition-all bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={!results || results.items.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium disabled:opacity-40 transition-all bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
          >
            <FileJson className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="Search IPs, domains, hashes, URLs…"
              className="w-full h-8 pl-8 pr-3 rounded-md text-sm bg-slate-900 border border-slate-700 outline-none transition-colors focus:border-cyan-700 text-slate-200 placeholder:text-slate-600"
            />
          </div>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 px-2 rounded-md text-xs border outline-none cursor-pointer appearance-none bg-slate-900 border-slate-700 text-slate-400"
          >
            <option value="">All Types</option>
            <option value="ipv4">IPv4</option>
            <option value="domain">Domain</option>
            <option value="url">URL</option>
            <option value="hash_md5">Hash MD5</option>
            <option value="hash_sha256">Hash SHA256</option>
          </select>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="h-8 px-2 rounded-md text-xs border outline-none cursor-pointer appearance-none bg-slate-900 border-slate-700 text-slate-400"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical (≥8.5)</option>
            <option value="high">High (7.0–8.9)</option>
            <option value="medium">Medium (4.0–6.9)</option>
            <option value="low">Low (&lt;4.0)</option>
          </select>
          <button
            onClick={applyFilters}
            className="h-8 flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-all bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Filter className="w-3 h-3" />
            Search
          </button>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-8 flex items-center gap-1.5 px-3 rounded-md text-xs font-medium transition-all bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results table */}
      <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
        {/* Table meta */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800/60">
          <span className="text-[9px] uppercase tracking-wider text-slate-500">
            {results ? `${results.total.toLocaleString()} result${results.total !== 1 ? "s" : ""}` : loading ? "Searching…" : ""}
          </span>
          {results && results.pages > 1 && (
            <span className="text-[9px] text-slate-500">Page {results.page} of {results.pages}</span>
          )}
        </div>

        {error && <div className="flex items-center gap-2 px-4 py-8 text-xs text-red-400">{error}</div>}
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
          </div>
        )}
        {!loading && !error && results && results.items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-slate-500">
            <Search className="w-8 h-8 opacity-20" />
            No indicators match your search criteria.
          </div>
        )}

        {!loading && results && results.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/60">
                  {["Indicator", "Type", "Score", "Severity", "Sources", "Last Seen"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.items.map((ioc) => {
                  const sev = getSeverity(ioc.severity);
                  return (
                    <tr
                      key={ioc.id}
                      className="group transition-colors cursor-pointer hover:bg-cyan-950/30 border-b border-slate-800/40 last:border-b-0"
                    >
                      <td className="px-4 py-2">
                        <Link href={`/iocs/${ioc.id}`} className="font-mono font-medium hover:underline truncate max-w-[240px] block text-cyan-300">
                          {ioc.value}
                        </Link>
                      </td>
                      <td className="px-4 py-2"><TypeBadge type={ioc.type} /></td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1 rounded-full overflow-hidden bg-slate-800 flex-shrink-0">
                            <div className={`h-full rounded-full ${sev.barCls}`} style={{ width: `${((ioc.severity ?? 0) / 10) * 100}%` }} />
                          </div>
                          <span className="tabular-nums font-mono text-slate-300">{(ioc.severity ?? 0).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2"><SevBadge score={ioc.severity} /></td>
                      <td className="px-4 py-2 tabular-nums text-slate-500">{ioc.source_count}</td>
                      <td className="px-4 py-2 font-mono text-slate-500">{formatRelativeTime(ioc.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && results && results.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800/60">
            <button
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs disabled:opacity-40 transition-all bg-slate-800 border border-slate-700 text-slate-400"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-[9px] text-slate-500">{currentPage} / {results.pages}</span>
            <button
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage >= results.pages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs disabled:opacity-40 transition-all bg-slate-800 border border-slate-700 text-slate-400"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
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
        <div className="space-y-4">
          <div className="skeleton h-9 w-48" />
          <div className="skeleton h-14" />
          <div className="skeleton h-72" />
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
