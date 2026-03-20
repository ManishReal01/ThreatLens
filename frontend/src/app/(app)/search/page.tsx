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
          <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--foreground)" }}>
            IOC Search
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Search across all threat intelligence feeds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={!results || results.items.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-all"
            style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={handleExportJSON}
            disabled={!results || results.items.length === 0}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 transition-all"
            style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            <FileJson className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div
        className="rounded-lg border p-3"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
              style={{ color: "var(--muted-foreground)" }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="Search IPs, domains, hashes, URLs…"
              className="w-full h-8 pl-8 pr-3 rounded text-sm bg-transparent border outline-none transition-colors focus:border-primary"
              style={{
                background: "var(--input)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
          </div>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-8 px-2 rounded text-xs border outline-none cursor-pointer appearance-none"
            style={{
              background: "var(--input)",
              borderColor: "var(--border)",
              color: type ? "var(--foreground)" : "var(--muted-foreground)",
            }}
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
            className="h-8 px-2 rounded text-xs border outline-none cursor-pointer appearance-none"
            style={{
              background: "var(--input)",
              borderColor: "var(--border)",
              color: severity ? "var(--foreground)" : "var(--muted-foreground)",
            }}
          >
            <option value="">All Severities</option>
            <option value="critical">Critical (≥9.0)</option>
            <option value="high">High (7.0–8.9)</option>
            <option value="medium">Medium (4.0–6.9)</option>
            <option value="low">Low (&lt;4.0)</option>
          </select>

          <button
            onClick={applyFilters}
            className="h-8 flex items-center gap-1.5 px-3 rounded text-xs font-medium transition-all"
            style={{
              background: "rgba(56,189,248,0.12)",
              border: "1px solid rgba(56,189,248,0.25)",
              color: "var(--primary)",
            }}
          >
            <Filter className="w-3 h-3" />
            Search
          </button>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="h-8 flex items-center gap-1.5 px-3 rounded text-xs font-medium transition-all"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results table */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        {/* Table meta */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
            {results
              ? `${results.total.toLocaleString()} result${results.total !== 1 ? "s" : ""}`
              : loading
              ? "Searching…"
              : ""}
          </span>
          {results && results.pages > 1 && (
            <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              Page {results.page} of {results.pages}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-8 text-xs"
            style={{ color: "#f87171" }}
          >
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
        {!loading && !error && results && results.items.length === 0 && (
          <div
            className="flex flex-col items-center justify-center h-32 gap-2 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Search className="w-8 h-8 opacity-20" />
            No indicators match your search criteria.
          </div>
        )}

        {/* Results */}
        {!loading && results && results.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid var(--border)` }}>
                  {["Indicator", "Type", "Score", "Severity", "Sources", "Last Seen"].map((h) => (
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
                {results.items.map((ioc, i) => {
                  const sev = getSeverity(ioc.severity);
                  return (
                    <tr
                      key={ioc.id}
                      className="group transition-colors cursor-pointer"
                      style={{
                        borderBottom: i < results.items.length - 1 ? `1px solid var(--border)` : undefined,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/iocs/${ioc.id}`}
                          className="font-mono font-medium hover:underline truncate max-w-[240px] block"
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
                            className="w-12 h-1.5 rounded-full overflow-hidden flex-shrink-0"
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
                      <td
                        className="px-4 py-2.5 tabular-nums"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {ioc.source_count}
                      </td>
                      <td
                        className="px-4 py-2.5 font-mono"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {formatRelativeTime(ioc.last_seen)}
                      </td>
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
            className="flex items-center justify-between px-4 py-2.5 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              onClick={() => changePage(currentPage - 1)}
              disabled={currentPage <= 1}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs disabled:opacity-40 transition-all"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              {currentPage} / {results.pages}
            </span>
            <button
              onClick={() => changePage(currentPage + 1)}
              disabled={currentPage >= results.pages}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs disabled:opacity-40 transition-all"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
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
