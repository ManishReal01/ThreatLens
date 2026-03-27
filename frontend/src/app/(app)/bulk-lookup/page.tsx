"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity } from "@/lib/utils";
import {
  Search, Download, X, Loader2, CheckCircle2, XCircle,
  ChevronRight, Terminal, Copy, Check,
} from "lucide-react";
import Link from "next/link";

/* ─── IOC type detection ─────────────────────────────────────────────────── */
const IPV4_RE   = /^(\d{1,3}\.){3}\d{1,3}$/;
const MD5_RE    = /^[0-9a-f]{32}$/i;
const SHA1_RE   = /^[0-9a-f]{40}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const URL_RE    = /^https?:\/\/.+/i;

function detectType(value: string): string {
  const v = value.trim();
  if (IPV4_RE.test(v))   return "ipv4";
  if (SHA256_RE.test(v)) return "hash_sha256";
  if (SHA1_RE.test(v))   return "hash_sha1";
  if (MD5_RE.test(v))    return "hash_md5";
  if (URL_RE.test(v))    return "url";
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

/* ─── Badge components ────────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-700 text-[9px] font-mono">—</span>;
  const sev = getSeverity(score);
  const ringCls =
    sev.label === "Critical" ? "ring-red-500/30 bg-red-950/50 text-red-400" :
    sev.label === "High"     ? "ring-orange-500/30 bg-orange-950/50 text-orange-400" :
    sev.label === "Medium"   ? "ring-amber-500/30 bg-amber-950/50 text-amber-400" :
    sev.label === "Low"      ? "ring-blue-500/30 bg-blue-950/50 text-blue-400" :
                               "ring-slate-500/30 bg-slate-800/50 text-slate-400";
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ring-1 ${ringCls}`}>
      <span className={`w-1 h-1 rounded-full ${sev.dotCls}`} />
      {score.toFixed(1)}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const label = type.replace("hash_", "").replace("ipv4", "ip");
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wider bg-cyan-950/50 text-cyan-400 ring-1 ring-cyan-500/20">
      {label}
    </span>
  );
}

/* ─── CSV export ─────────────────────────────────────────────────────────── */
function exportCsv(results: LookupResult[]) {
  const header = "Value,Detected Type,Found,DB Type,Severity,Sources,Last Seen,ID";
  const rows = results.map((r) =>
    [`"${r.value}"`, r.detectedType, r.found ? "YES" : "NO", r.type ?? "",
     r.severity?.toFixed(1) ?? "", r.source_count ?? "",
     r.last_seen?.slice(0, 10) ?? "", r.id ?? ""].join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `bulk-lookup-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/* ─── Copy button ────────────────────────────────────────────────────────── */
function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0"
      title="Copy value"
    >
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3 text-slate-600 hover:text-cyan-400" />
      }
    </button>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function BulkLookupPage() {
  const [input,    setInput]    = useState("");
  const [results,  setResults]  = useState<LookupResult[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const lines       = input.split("\n").map((l) => l.trim()).filter(Boolean);
  const uniqueLines = Array.from(new Set(lines));
  const overLimit   = uniqueLines.length > 100;

  const runLookup = async () => {
    if (uniqueLines.length === 0 || overLimit) return;
    setLoading(true); setError(null); setSearched(false);
    try {
      const apiResults: {
        value: string; found: boolean; id: string | null;
        type: string | null; severity: number | null;
        source_count: number | null; last_seen: string | null;
      }[] = await fetchApi("/api/iocs/bulk-lookup", {
        method: "POST",
        body: JSON.stringify({ values: uniqueLines }),
      });
      const mapped: LookupResult[] = apiResults.map((r) => ({ ...r, detectedType: detectType(r.value) }));
      mapped.sort((a, b) => {
        if (a.found !== b.found) return a.found ? -1 : 1;
        return (b.severity ?? 0) - (a.severity ?? 0);
      });
      setResults(mapped); setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally { setLoading(false); }
  };

  const foundCount    = results.filter((r) => r.found).length;
  const notFoundCount = results.filter((r) => !r.found).length;

  return (
    <div className="space-y-2 animate-in fade-in duration-400 max-w-5xl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest font-mono text-slate-200">Bulk IOC Lookup</h1>
          <p className="text-[9px] mt-0.5 text-slate-600 uppercase tracking-wider">Up to 100 IOCs · one per line</p>
        </div>
        {searched && results.length > 0 && (
          <button
            onClick={() => exportCsv(results)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[9px] font-mono uppercase tracking-wider transition-all"
            style={{ background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", color: "#22d3ee" }}
          >
            <Download className="w-3 h-3" /> Export CSV
          </button>
        )}
      </div>

      {/* ── Input panel ─────────────────────────────────────────────────── */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ background: "rgba(10,16,32,0.7)", border: "1px solid rgba(34,211,238,0.1)" }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: "1px solid rgba(34,211,238,0.08)", background: "rgba(34,211,238,0.02)" }}
        >
          <div className="flex items-center gap-2">
            <Terminal className="w-3 h-3 text-cyan-500" />
            <span className="text-[9px] font-bold uppercase tracking-widest font-mono text-slate-400">IOC Input</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`text-[8px] px-2 py-0.5 rounded tabular-nums font-mono font-bold ring-1 ${
                overLimit
                  ? "ring-red-500/30 bg-red-950/50 text-red-400"
                  : uniqueLines.length > 0
                  ? "ring-cyan-500/20 bg-cyan-950/40 text-cyan-400"
                  : "ring-slate-700 bg-slate-800/60 text-slate-600"
              }`}
            >
              {uniqueLines.length} / 100
            </span>
            {input && (
              <button
                onClick={() => { setInput(""); setResults([]); setSearched(false); }}
                className="p-0.5 rounded transition-colors text-slate-600 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Textarea with subtle line-number aesthetic */}
        <div className="flex" style={{ minHeight: 160 }}>
          {/* Line numbers */}
          <div
            className="flex-shrink-0 px-2 py-3 text-right select-none"
            style={{ minWidth: 36, borderRight: "1px solid rgba(34,211,238,0.06)", background: "rgba(7,13,24,0.4)" }}
          >
            {(uniqueLines.length > 0 ? uniqueLines : [""]).map((_, i) => (
              <div key={i} className="text-[9px] font-mono leading-[1.6rem] text-slate-800 tabular-nums">
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={"1.2.3.4\nevil.com\nd41d8cd98f00b204e9800998ecf8427e\nhttps://malware.example/payload.exe"}
            className="flex-1 p-3 text-[11px] font-mono resize-none outline-none bg-transparent placeholder:text-slate-800 leading-[1.6rem]"
            style={{ color: "#67e8f9" }}
            spellCheck={false}
          />
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-3 py-2"
          style={{ borderTop: "1px solid rgba(34,211,238,0.08)" }}
        >
          <button
            onClick={runLookup}
            disabled={loading || uniqueLines.length === 0 || overLimit}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{ background: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee" }}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            {loading ? "Looking up…" : "Lookup"}
          </button>
          {overLimit && (
            <span className="text-[9px] font-mono text-red-400">
              Exceeds limit — remove {uniqueLines.length - 100} entries
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 rounded text-[10px] font-mono" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {searched && results.length > 0 && (
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: "rgba(10,16,32,0.7)", border: "1px solid rgba(34,211,238,0.1)" }}
        >
          {/* Results header */}
          <div
            className="flex items-center gap-3 px-3 py-2"
            style={{ borderBottom: "1px solid rgba(34,211,238,0.08)", background: "rgba(34,211,238,0.02)" }}
          >
            <span className="text-[9px] font-bold uppercase tracking-widest font-mono text-slate-400">Results</span>
            <div className="flex items-center gap-2 ml-auto">
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold ring-1"
                style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}
              >
                <CheckCircle2 className="w-2.5 h-2.5" />
                {foundCount} found
              </div>
              <div
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold"
                style={{ background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", color: "#64748b" }}
              >
                <XCircle className="w-2.5 h-2.5" />
                {notFoundCount} not found
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div
            className="hidden md:grid px-3 py-1.5 text-[8px] uppercase tracking-widest font-bold font-mono text-slate-700"
            style={{
              gridTemplateColumns: "1fr 80px 80px 90px 70px 90px 24px",
              gap: "12px",
              borderBottom: "1px solid rgba(34,211,238,0.06)",
            }}
          >
            <span>IOC Value</span>
            <span>Det. Type</span>
            <span>Status</span>
            <span>DB Type</span>
            <span>Severity</span>
            <span>Last Seen</span>
            <span />
          </div>

          <div>
            {results.map((r, i) => (
              <div
                key={i}
                className="hidden md:grid px-3 py-1.5 items-center transition-colors group"
                style={{
                  gridTemplateColumns: "1fr 80px 80px 90px 70px 90px 24px",
                  gap: "12px",
                  borderBottom: "1px solid rgba(34,211,238,0.04)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(8,28,44,0.8)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span
                    className="font-mono text-[11px] truncate"
                    style={{ color: r.found ? "#67e8f9" : "#475569" }}
                  >
                    {r.value}
                  </span>
                  <CopyBtn value={r.value} />
                </div>
                <div><TypeBadge type={r.detectedType} /></div>
                <div>
                  {r.found ? (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold ring-1"
                      style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399" }}
                    >
                      <CheckCircle2 className="w-2.5 h-2.5" /> Found
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold"
                      style={{ background: "rgba(100,116,139,0.08)", border: "1px solid rgba(100,116,139,0.2)", color: "#475569" }}
                    >
                      <XCircle className="w-2.5 h-2.5" /> None
                    </span>
                  )}
                </div>
                <div>{r.type ? <TypeBadge type={r.type} /> : <span className="text-slate-700 text-[9px] font-mono">—</span>}</div>
                <div><SevBadge score={r.severity} /></div>
                <div className="text-[9px] font-mono text-slate-700">{r.last_seen?.slice(0, 10) ?? "—"}</div>
                <div>
                  {r.found && r.id ? (
                    <Link
                      href={`/iocs/${r.id}`}
                      className="flex items-center justify-center w-5 h-5 rounded transition-colors text-slate-700 hover:text-cyan-400"
                      style={{ border: "1px solid rgba(34,211,238,0.1)" }}
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}

            {/* Mobile fallback rows */}
            {results.map((r, i) => (
              <div
                key={`m-${i}`}
                className="md:hidden flex items-center gap-2 px-3 py-2 transition-colors"
                style={{ borderBottom: "1px solid rgba(34,211,238,0.04)" }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: r.found ? "#34d399" : "#475569", boxShadow: r.found ? "0 0 4px #34d39990" : undefined }}
                />
                <span className="font-mono text-[10px] truncate flex-1" style={{ color: r.found ? "#67e8f9" : "#475569" }}>
                  {r.value}
                </span>
                <SevBadge score={r.severity} />
                {r.found && r.id && (
                  <Link href={`/iocs/${r.id}`} className="text-slate-600 hover:text-cyan-400">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {searched && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Search className="w-8 h-8 text-slate-800" />
          <p className="text-[10px] uppercase tracking-wider text-slate-600">No results returned</p>
        </div>
      )}
    </div>
  );
}
