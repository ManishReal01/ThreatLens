"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity } from "@/lib/utils";
import {
  Search, Download, X, Loader2, CheckCircle2, XCircle, AlertCircle,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

/* ─── IOC type detection ─────────────────────────────────────────────────── */
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const MD5_RE = /^[0-9a-f]{32}$/i;
const SHA1_RE = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const URL_RE = /^https?:\/\/.+/i;

function detectType(value: string): string {
  const v = value.trim();
  if (IPV4_RE.test(v)) return "ipv4";
  if (SHA256_RE.test(v)) return "hash_sha256";
  if (SHA1_RE.test(v)) return "hash_sha1";
  if (MD5_RE.test(v)) return "hash_md5";
  if (URL_RE.test(v)) return "url";
  if (DOMAIN_RE.test(v)) return "domain";
  return "unknown";
}

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface LookupResult {
  value: string;
  detectedType: string;
  found: boolean;
  id: string | null;
  type: string | null;
  severity: number | null;
  source_count: number | null;
  last_seen: string | null;
}

/* ─── Severity badge ─────────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: "var(--muted-foreground)" }}>—</span>;
  const sev = getSeverity(score);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${sev.cls}`}>
      <span className={`w-1 h-1 rounded-full ${sev.dotCls}`} />
      {score.toFixed(1)}
    </span>
  );
}

/* ─── Type badge ─────────────────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  ipv4:        "bg-sky-500/10 text-sky-400 border-sky-500/20",
  ip:          "bg-sky-500/10 text-sky-400 border-sky-500/20",
  domain:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
  url:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  hash_md5:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha1:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha256: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  unknown:     "bg-slate-500/10 text-slate-400 border-slate-500/20",
};
function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? TYPE_COLORS.unknown;
  const label = type.replace("hash_", "").replace("ipv4", "ip");
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${cls}`}>
      {label}
    </span>
  );
}

/* ─── CSV export ─────────────────────────────────────────────────────────── */
function exportCsv(results: LookupResult[]) {
  const header = "Value,Detected Type,Found,DB Type,Severity,Sources,Last Seen,ID";
  const rows = results.map((r) =>
    [
      `"${r.value}"`,
      r.detectedType,
      r.found ? "YES" : "NO",
      r.type ?? "",
      r.severity?.toFixed(1) ?? "",
      r.source_count ?? "",
      r.last_seen?.slice(0, 10) ?? "",
      r.id ?? "",
    ].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bulk-lookup-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function BulkLookupPage() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<LookupResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const uniqueLines = Array.from(new Set(lines));
  const overLimit = uniqueLines.length > 100;

  const runLookup = async () => {
    if (uniqueLines.length === 0 || overLimit) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const apiResults: {
        value: string;
        found: boolean;
        id: string | null;
        type: string | null;
        severity: number | null;
        source_count: number | null;
        last_seen: string | null;
      }[] = await fetchApi("/api/iocs/bulk-lookup", {
        method: "POST",
        body: JSON.stringify({ values: uniqueLines }),
      });

      const mapped: LookupResult[] = apiResults.map((r) => ({
        ...r,
        detectedType: detectType(r.value),
      }));

      // Sort: found first, then by severity desc
      mapped.sort((a, b) => {
        if (a.found !== b.found) return a.found ? -1 : 1;
        return (b.severity ?? 0) - (a.severity ?? 0);
      });

      setResults(mapped);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const foundCount = results.filter((r) => r.found).length;
  const notFoundCount = results.filter((r) => !r.found).length;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold font-heading" style={{ color: "var(--foreground)" }}>
            Bulk IOC Lookup
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Paste up to 100 IOCs (one per line) — IPs, domains, hashes, and URLs supported
          </p>
        </div>
        {searched && results.length > 0 && (
          <button
            onClick={() => exportCsv(results)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all flex-shrink-0"
            style={{
              background: "rgba(56,189,248,0.08)",
              border: "1px solid rgba(56,189,248,0.25)",
              color: "var(--primary)",
            }}
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Input area */}
      <div
        className="rounded-lg border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <span className="text-xs font-semibold font-heading" style={{ color: "var(--foreground)" }}>
            IOC Input
          </span>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] px-2 py-0.5 rounded tabular-nums"
              style={{
                background: overLimit ? "rgba(239,68,68,0.1)" : "var(--muted)",
                border: overLimit ? "1px solid rgba(239,68,68,0.2)" : "1px solid var(--border)",
                color: overLimit ? "#f87171" : "var(--muted-foreground)",
              }}
            >
              {uniqueLines.length} / 100
            </span>
            {input && (
              <button
                onClick={() => { setInput(""); setResults([]); setSearched(false); }}
                className="p-0.5 rounded transition-colors"
                style={{ color: "var(--muted-foreground)" }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"1.2.3.4\nevil.com\nd41d8cd98f00b204e9800998ecf8427e\nhttps://malware.example/payload.exe"}
          className="w-full p-4 text-xs font-mono resize-none outline-none"
          style={{
            background: "var(--card)",
            color: "var(--foreground)",
            minHeight: "160px",
          }}
          spellCheck={false}
        />
        <div
          className="flex items-center gap-3 px-4 py-3 border-t"
          style={{ borderColor: "var(--border)" }}
        >
          <button
            onClick={runLookup}
            disabled={loading || uniqueLines.length === 0 || overLimit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded text-sm font-medium transition-all disabled:opacity-40"
            style={{ background: "var(--primary)", color: "#000" }}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Search className="w-3.5 h-3.5" />
            )}
            {loading ? "Looking up…" : "Lookup"}
          </button>
          {overLimit && (
            <span className="text-xs" style={{ color: "#f87171" }}>
              Exceeds 100 IOC limit — remove {uniqueLines.length - 100} entries
            </span>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Results */}
      {searched && results.length > 0 && (
        <div
          className="rounded-lg border overflow-hidden"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          {/* Summary */}
          <div
            className="flex items-center gap-4 px-4 py-3 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-xs font-semibold font-heading" style={{ color: "var(--foreground)" }}>
              Results
            </span>
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "#4ade80" }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                {foundCount} found
              </div>
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                <XCircle className="w-3.5 h-3.5" />
                {notFoundCount} not found
              </div>
            </div>
          </div>

          {/* Table header */}
          <div
            className="hidden md:grid grid-cols-[1fr_100px_80px_120px_80px_120px_32px] gap-3 px-4 py-2 border-b text-[9px] uppercase tracking-wider font-semibold"
            style={{ borderColor: "var(--border)", background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            <span>IOC Value</span>
            <span>Det. Type</span>
            <span>Status</span>
            <span>DB Type</span>
            <span>Severity</span>
            <span>Last Seen</span>
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {results.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-[1fr_100px_80px_120px_80px_120px_32px] gap-2 md:gap-3 px-4 py-2.5 items-center"
                style={{
                  background: r.found ? "rgba(34,197,94,0.02)" : undefined,
                }}
              >
                {/* Value */}
                <div className="font-mono text-xs truncate" style={{ color: r.found ? "var(--foreground)" : "var(--muted-foreground)" }}>
                  {r.value}
                </div>

                {/* Detected type */}
                <div>
                  <TypeBadge type={r.detectedType} />
                </div>

                {/* Found/not found */}
                <div>
                  {r.found ? (
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "#4ade80" }}>
                      <CheckCircle2 className="w-3 h-3" />
                      Found
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                      <AlertCircle className="w-3 h-3" />
                      Not found
                    </span>
                  )}
                </div>

                {/* DB type */}
                <div>
                  {r.type ? <TypeBadge type={r.type} /> : <span style={{ color: "var(--muted-foreground)" }} className="text-xs">—</span>}
                </div>

                {/* Severity */}
                <div>
                  <SevBadge score={r.severity} />
                </div>

                {/* Last seen */}
                <div className="text-[10px] font-mono" style={{ color: "var(--muted-foreground)" }}>
                  {r.last_seen?.slice(0, 10) ?? "—"}
                </div>

                {/* Link */}
                <div>
                  {r.found && r.id ? (
                    <Link
                      href={`/iocs/${r.id}`}
                      className="flex items-center justify-center p-1 rounded transition-colors"
                      style={{ color: "var(--muted-foreground)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--primary)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)"; }}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {searched && results.length === 0 && (
        <div className="text-center py-12" style={{ color: "var(--muted-foreground)" }}>
          <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No results returned</p>
        </div>
      )}
    </div>
  );
}
