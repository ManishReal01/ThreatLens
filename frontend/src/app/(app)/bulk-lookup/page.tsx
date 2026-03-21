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
  if (score === null) return <span className="text-slate-600">—</span>;
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
      {score.toFixed(1)}
    </span>
  );
}

/* ─── Type badge ─────────────────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  const label = type.replace("hash_", "").replace("ipv4", "ip");
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-cyan-950/50 text-cyan-300 ring-1 ring-cyan-500/20">
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
          <h1 className="text-2xl font-bold font-heading tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            Bulk IOC Lookup
          </h1>
          <p className="text-xs mt-0.5 text-slate-500">
            Paste up to 100 IOCs (one per line) — IPs, domains, hashes, and URLs supported
          </p>
        </div>
        {searched && results.length > 0 && (
          <button
            onClick={() => exportCsv(results)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
          <span className="text-[11px] font-semibold font-heading text-slate-200">IOC Input</span>
          <div className="flex items-center gap-2">
            <span className={`text-[9px] px-2 py-0.5 rounded-full tabular-nums ring-1 ${overLimit ? "ring-red-500/30 bg-red-950/40 text-red-400" : "ring-slate-700 bg-slate-800 text-slate-500"}`}>
              {uniqueLines.length} / 100
            </span>
            {input && (
              <button onClick={() => { setInput(""); setResults([]); setSearched(false); }} className="p-0.5 rounded transition-colors text-slate-500 hover:text-slate-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"1.2.3.4\nevil.com\nd41d8cd98f00b204e9800998ecf8427e\nhttps://malware.example/payload.exe"}
          className="w-full p-4 text-xs font-mono resize-none outline-none bg-transparent text-slate-300 placeholder:text-slate-700"
          style={{ minHeight: "140px" }}
          spellCheck={false}
        />
        <div className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-800/60">
          <button
            onClick={runLookup}
            disabled={loading || uniqueLines.length === 0 || overLimit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all disabled:opacity-40 bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {loading ? "Looking up…" : "Lookup"}
          </button>
          {overLimit && <span className="text-xs text-red-400">Exceeds 100 IOC limit — remove {uniqueLines.length - 100} entries</span>}
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-md text-sm bg-red-950/20 border border-red-800/40 text-red-400">{error}</div>}

      {/* Results */}
      {searched && results.length > 0 && (
        <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2.5 border-b border-slate-800/60">
            <span className="text-[11px] font-semibold font-heading text-slate-200">Results</span>
            <div className="flex items-center gap-3 ml-auto">
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {foundCount} found
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <XCircle className="w-3.5 h-3.5" />
                {notFoundCount} not found
              </div>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[1fr_100px_80px_120px_80px_120px_32px] gap-3 px-4 py-2 border-b border-slate-800/40 text-[9px] uppercase tracking-wider font-semibold text-slate-500 bg-slate-900/60">
            <span>IOC Value</span>
            <span>Det. Type</span>
            <span>Status</span>
            <span>DB Type</span>
            <span>Severity</span>
            <span>Last Seen</span>
            <span />
          </div>

          <div className="divide-y divide-slate-800/40">
            {results.map((r, i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-[1fr_100px_80px_120px_80px_120px_32px] gap-2 md:gap-3 px-4 py-2 items-center hover:bg-cyan-950/20 transition-colors"
              >
                <div className={`font-mono text-xs truncate ${r.found ? "text-cyan-300" : "text-slate-500"}`}>{r.value}</div>
                <div><TypeBadge type={r.detectedType} /></div>
                <div>
                  {r.found ? (
                    <span className="inline-flex items-center gap-1 text-[9px] text-emerald-400"><CheckCircle2 className="w-3 h-3" />Found</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[9px] text-slate-500"><AlertCircle className="w-3 h-3" />Not found</span>
                  )}
                </div>
                <div>{r.type ? <TypeBadge type={r.type} /> : <span className="text-slate-600 text-xs">—</span>}</div>
                <div><SevBadge score={r.severity} /></div>
                <div className="text-[9px] font-mono text-slate-500">{r.last_seen?.slice(0, 10) ?? "—"}</div>
                <div>
                  {r.found && r.id ? (
                    <Link href={`/iocs/${r.id}`} className="flex items-center justify-center p-1 rounded transition-colors text-slate-500 hover:text-cyan-400">
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
        <div className="text-center py-12 text-slate-500">
          <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No results returned</p>
        </div>
      )}
    </div>
  );
}
