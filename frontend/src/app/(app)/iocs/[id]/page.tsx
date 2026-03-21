"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatDate, formatDateTime } from "@/lib/utils";
import {
  ArrowLeft, Network, ShieldAlert, Tag, MessageSquare,
  Clock, X, Edit3, Trash2, Save, Bookmark, BookmarkCheck,
  Layers, AlertTriangle, ChevronRight, Users, Zap, ExternalLink, Loader2,
  GitCommitHorizontal, FileDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* ─── Types (matching backend schemas.py) ─────────────────────────────── */
interface ThreatActorLink {
  id: string;
  mitre_id: string;
  name: string;
  country: string | null;
  motivations: string[];
  confidence: number | null;
}
interface IOCSource {
  id: string;
  feed_name: string;
  raw_score: number | null;
  ingested_at: string;
  raw_payload: Record<string, unknown> | null;
}
interface IOCTag {
  id: string;
  tag: string;
  created_at: string;
}
interface IOCNote {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
}
interface IOCDetail {
  id: string;
  value: string;
  type: string;
  severity: number | null;
  first_seen: string;
  last_seen: string;
  source_count: number;
  is_active: boolean;
  score_version: number;
  score_explanation: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  sources: IOCSource[];
  tags: IOCTag[];
  notes: IOCNote[];
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─── Type badge ────────────────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  ipv4:        "bg-sky-500/10 text-sky-400 border-sky-500/20",
  domain:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
  url:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  hash_md5:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha1:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha256: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const PREDEFINED_TAGS = ["confirmed", "false-positive", "watching", "investigating", "resolved", "c2", "phishing"];

/* ─── Enrichment display ─────────────────────────────────────────────────── */
function EnrichmentDisplay({ enrichment }: { enrichment: Record<string, unknown> | undefined }) {
  if (!enrichment) return null;
  const e = enrichment;
  if (e.type === "geoip") {
    const fields: [string, unknown][] = [
      ["Country", e.country], ["Region", e.regionName], ["City", e.city],
      ["ISP", e.isp], ["Org", e.org], ["AS", e.as],
    ];
    return (
      <>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {fields.map(([label, val]) => val ? (
            <div key={label as string}>
              <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>{label as string}</div>
              <div style={{ color: "var(--foreground)" }}>{String(val)}</div>
            </div>
          ) : null)}
        </div>
        <p className="text-[9px] mt-3" style={{ color: "var(--muted-foreground)" }}>
          Enriched {(e.enriched_at as string)?.slice(0, 10)}
        </p>
      </>
    );
  }
  if (e.type === "dns") {
    const aRecords = (e.A as string[]) ?? [];
    const mxRecords = (e.MX as string[]) ?? [];
    return (
      <>
        <div className="space-y-3 text-xs">
          <div>
            <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>A Records</div>
            {aRecords.length > 0 ? aRecords.map((r, i) => (
              <div key={i} className="font-mono" style={{ color: "var(--primary)" }}>{r}</div>
            )) : <span style={{ color: "var(--muted-foreground)" }}>None</span>}
          </div>
          {mxRecords.length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>MX Records</div>
              {mxRecords.map((r, i) => (
                <div key={i} className="font-mono" style={{ color: "var(--foreground)" }}>{r}</div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[9px] mt-3" style={{ color: "var(--muted-foreground)" }}>
          Enriched {(e.enriched_at as string)?.slice(0, 10)}
        </p>
      </>
    );
  }
  if (e.type === "hash_link") {
    return (
      <>
        <a
          href={e.virustotal_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "#c084fc" }}
        >
          <ExternalLink className="w-3 h-3" />
          View on VirusTotal
        </a>
        <p className="text-[9px] mt-2" style={{ color: "var(--muted-foreground)" }}>
          Enriched {(e.enriched_at as string)?.slice(0, 10)}
        </p>
      </>
    );
  }
  if (e.type === "url_link") {
    return (
      <>
        <a
          href={e.urlhaus_url as string}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: "#c084fc" }}
        >
          <ExternalLink className="w-3 h-3" />
          View on URLhaus
        </a>
        <p className="text-[9px] mt-2" style={{ color: "var(--muted-foreground)" }}>
          Enriched {(e.enriched_at as string)?.slice(0, 10)}
        </p>
      </>
    );
  }
  return (
    <pre className="text-xs" style={{ color: "var(--muted-foreground)" }}>
      {JSON.stringify(e, null, 2)}
    </pre>
  );
}

/* ─── Feed colours ───────────────────────────────────────────────────────── */
const FEED_COLORS: Record<string, string> = {
  abuseipdb: "#38bdf8",
  urlhaus:   "#4ade80",
  otx:       "#c084fc",
};
const feedColor = (name: string) => FEED_COLORS[name] ?? "#94a3b8";

/* ─── IOC Timeline ───────────────────────────────────────────────────────── */
function IOCTimeline({ firstSeen, lastSeen, sources }: {
  firstSeen: string;
  lastSeen:  string;
  sources:   IOCSource[];
}) {
  interface TimeEvent {
    ts:    number;
    label: string;
    color: string;
    kind:  "anchor" | "source";
  }

  const events: TimeEvent[] = [
    { ts: new Date(firstSeen).getTime(), label: "First Seen", color: "#e2e8f0", kind: "anchor" as const },
    ...sources.map((s) => ({
      ts:    new Date(s.ingested_at).getTime(),
      label: s.feed_name,
      color: feedColor(s.feed_name),
      kind:  "source" as const,
    })),
    { ts: new Date(lastSeen).getTime(), label: "Last Seen", color: "#f87171", kind: "anchor" as const },
  ].sort((a, b) => a.ts - b.ts);

  const minTs = events[0].ts;
  const maxTs = events[events.length - 1].ts;
  const range = maxTs - minTs || 1;
  const pct   = (ts: number) => ((ts - minTs) / range) * 100;

  // Unique feeds for legend
  const seenFeeds = Array.from(new Set(sources.map((s) => s.feed_name)));

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <GitCommitHorizontal className="w-4 h-4" style={{ color: "var(--primary)" }} />
        <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
          IOC Timeline
        </h2>
        <span
          className="ml-auto text-[10px] px-1.5 py-0.5 rounded tabular-nums"
          style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
        >
          {events.length} events
        </span>
      </div>
      <div className="px-6 pt-6 pb-5">
        {/* Track + dots */}
        <div className="relative h-8">
          {/* Horizontal track line */}
          <div
            className="absolute top-1/2 left-0 right-0 h-px"
            style={{ background: "var(--border)", transform: "translateY(-50%)" }}
          />
          {events.map((ev, i) => (
            <div
              key={i}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 group"
              style={{ left: `${pct(ev.ts)}%` }}
            >
              {/* Dot */}
              <div
                className="rounded-full border-2 transition-transform group-hover:scale-150 cursor-default"
                style={{
                  width:       ev.kind === "anchor" ? "12px" : "10px",
                  height:      ev.kind === "anchor" ? "12px" : "10px",
                  background:  ev.color,
                  borderColor: ev.color,
                  boxShadow:   `0 0 6px ${ev.color}66`,
                }}
                title={`${ev.label} — ${new Date(ev.ts).toLocaleString()}`}
              />
            </div>
          ))}
        </div>

        {/* Date labels at start / end */}
        <div className="flex justify-between mt-2 text-[9px] font-mono" style={{ color: "var(--muted-foreground)" }}>
          <span>{new Date(firstSeen).toLocaleDateString()}</span>
          <span>{new Date(lastSeen).toLocaleDateString()}</span>
        </div>

        {/* Legend */}
        {seenFeeds.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t" style={{ borderColor: "var(--border)" }}>
            <span className="text-[9px] uppercase tracking-wider self-center" style={{ color: "var(--muted-foreground)" }}>
              Feeds:
            </span>
            {seenFeeds.map((f) => (
              <span key={f} className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: feedColor(f) }}
                />
                {f}
              </span>
            ))}
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#e2e8f0" }} />
              first seen
            </span>
            <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: "#f87171" }} />
              last seen
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Download helper ────────────────────────────────────────────────────── */
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";
async function downloadReport(endpoint: string, filename: string) {
  const res = await fetch(`${BACKEND_URL}${endpoint}`, { method: "POST" });
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Main page ─────────────────────────────────────────────────────────── */
// Next.js 14: params is a plain object (not a Promise)
export default function IOCDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [data, setData] = useState<IOCDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isWatched, setIsWatched] = useState(false);
  const [threatActors, setThreatActors] = useState<ThreatActorLink[]>([]);

  const [newTag, setNewTag] = useState("");
  const [newNote, setNewNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteText, setEditNoteText] = useState("");

  // Enrichment
  const [enriching, setEnriching] = useState(false);
  const [enrichError, setEnrichError] = useState<string | null>(null);

  // Report
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res: IOCDetail = await fetchApi(`/api/iocs/${id}`);
        setData(res);
        // Check watchlist
        try {
          const wl = await fetchApi("/api/workspace/watchlist");
          const items: { id: string }[] = wl?.items ?? wl ?? [];
          setIsWatched(items.some((item) => item.id === id));
        } catch { /* watchlist check is non-critical */ }
        try {
          const actors = await fetchApi(`/api/iocs/${id}/threat-actors`);
          setThreatActors(actors ?? []);
        } catch { /* threat actor fetch is non-critical */ }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
          setNotFound(true);
        } else {
          setError("Failed to load IOC details.");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  /* ── Watchlist toggle ─────────────────────────────────────────────────── */
  const toggleWatchlist = async () => {
    const next = !isWatched;
    try {
      if (next) {
        await fetchApi("/api/workspace/watchlist", { method: "POST", body: JSON.stringify({ ioc_id: id }) });
      } else {
        await fetchApi(`/api/workspace/watchlist/${id}`, { method: "DELETE" });
      }
      setIsWatched(next);
    } catch { setIsWatched(next); }
  };

  /* ── Tags ─────────────────────────────────────────────────────────────── */
  const addTag = async (tag: string) => {
    if (!tag || !data) return;
    if (data.tags.some((t) => t.tag === tag)) return;
    const optimistic: IOCTag = { id: `tmp-${Date.now()}`, tag, created_at: new Date().toISOString() };
    setData({ ...data, tags: [...data.tags, optimistic] });
    try {
      await fetchApi(`/api/iocs/${id}/tags`, { method: "POST", body: JSON.stringify({ tag }) });
    } catch { /* optimistic update stays */ }
    setNewTag("");
  };

  const removeTag = async (tagId: string, tagStr: string) => {
    if (!data) return;
    setData({ ...data, tags: data.tags.filter((t) => t.id !== tagId) });
    try {
      await fetchApi(`/api/iocs/${id}/tags/${tagStr}`, { method: "DELETE" });
    } catch { /* optimistic already applied */ }
  };

  /* ── Notes ─────────────────────────────────────────────────────────────── */
  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !data) return;
    const now = new Date().toISOString();
    const optimistic: IOCNote = { id: `tmp-${Date.now()}`, body: newNote, created_at: now, updated_at: now };
    setData({ ...data, notes: [...data.notes, optimistic] });
    setNewNote("");
    try {
      await fetchApi(`/api/iocs/${id}/notes`, { method: "POST", body: JSON.stringify({ body: newNote }) });
    } catch { /* optimistic update stays */ }
  };

  const updateNote = async (noteId: string) => {
    if (!editNoteText.trim() || !data) return;
    setData({ ...data, notes: data.notes.map((n) => n.id === noteId ? { ...n, body: editNoteText } : n) });
    setEditingNoteId(null);
    try {
      await fetchApi(`/api/iocs/${id}/notes/${noteId}`, { method: "PUT", body: JSON.stringify({ body: editNoteText }) });
    } catch { /* optimistic */ }
  };

  const deleteNote = async (noteId: string) => {
    if (!data) return;
    setData({ ...data, notes: data.notes.filter((n) => n.id !== noteId) });
    try {
      await fetchApi(`/api/iocs/${id}/notes/${noteId}`, { method: "DELETE" });
    } catch { /* optimistic */ }
  };

  /* ── Enrichment ─────────────────────────────────────────────────────────── */
  const runEnrich = async () => {
    if (!data) return;
    setEnriching(true);
    setEnrichError(null);
    try {
      let enrichment: Record<string, unknown> = {};
      const iocType = data.type;
      const value = data.value;

      if (iocType === "ipv4" || iocType === "ip") {
        // ip-api.com — free, CORS-enabled
        const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(value)}?fields=status,country,regionName,city,isp,org,as,query`);
        const geo = await res.json();
        enrichment = { type: "geoip", ...geo, enriched_at: new Date().toISOString() };
      } else if (iocType === "domain") {
        // Google Public DNS-over-HTTPS
        const [aRes, mxRes] = await Promise.all([
          fetch(`https://dns.google/resolve?name=${encodeURIComponent(value)}&type=A`).then(r => r.json()),
          fetch(`https://dns.google/resolve?name=${encodeURIComponent(value)}&type=MX`).then(r => r.json()).catch(() => null),
        ]);
        enrichment = {
          type: "dns",
          A: aRes?.Answer?.map((r: { data: string }) => r.data) ?? [],
          MX: mxRes?.Answer?.map((r: { data: string }) => r.data) ?? [],
          enriched_at: new Date().toISOString(),
        };
      } else if (iocType.startsWith("hash")) {
        enrichment = {
          type: "hash_link",
          virustotal_url: `https://www.virustotal.com/gui/file/${value}`,
          enriched_at: new Date().toISOString(),
        };
      } else if (iocType === "url") {
        enrichment = {
          type: "url_link",
          urlhaus_url: `https://urlhaus.abuse.ch/url/${encodeURIComponent(value)}`,
          enriched_at: new Date().toISOString(),
        };
      }

      // Merge into metadata via backend
      const updated = await fetchApi(`/api/iocs/${id}/metadata`, {
        method: "PATCH",
        body: JSON.stringify({ enrichment }),
      });
      setData({ ...data, metadata: updated });
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  };

  /* ── States ─────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-5 max-w-6xl">
        <Sk className="h-6 w-32" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Sk className="h-32" />
            <Sk className="h-52" />
            <Sk className="h-48" />
          </div>
          <div className="space-y-4">
            <Sk className="h-48" />
            <Sk className="h-52" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <AlertTriangle className="w-10 h-10" style={{ color: "#f87171" }} />
        <div>
          <div className="font-semibold font-heading" style={{ color: "var(--foreground)" }}>IOC Not Found</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
            The indicator <span className="font-mono">{id}</span> does not exist.
          </div>
        </div>
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs"
          style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Go Back
        </button>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="flex items-center gap-3 px-5 py-4 rounded-lg border text-sm"
        style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#f87171" }}
      >
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        {error ?? "Unknown error loading IOC."}
      </div>
    );
  }

  const sev = getSeverity(data.severity);

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-5 max-w-6xl animate-in fade-in duration-400">

      {/* ── Breadcrumb nav ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
        <button onClick={() => router.back()} className="flex items-center gap-1 hover:text-primary transition-colors">
          <ArrowLeft className="w-3 h-3" /> Back
        </button>
        <ChevronRight className="w-3 h-3" />
        <Link href="/search" className="hover:text-primary transition-colors">IOC Search</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="font-mono truncate max-w-[200px]" style={{ color: "var(--foreground)" }}>{data.value}</span>
      </div>

      {/* ── IOC Header ─────────────────────────────────────────────────── */}
      <div
        className="rounded-lg border border-slate-700/50 p-4 relative overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="absolute inset-0 bg-grid-ops opacity-30 pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {/* Type badge */}
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${TYPE_COLORS[data.type] ?? "bg-muted/20 text-muted-foreground border-muted/30"}`}
              >
                {data.type}
              </span>
              {/* Active/inactive */}
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border ${data.is_active ? "bg-[#22c55e]/10 text-[#4ade80] border-[#22c55e]/20" : "bg-muted/10 text-muted-foreground border-muted/20"}`}
              >
                <span className={`w-1 h-1 rounded-full ${data.is_active ? "bg-[#22c55e] status-pulse" : "bg-muted-foreground"}`} />
                {data.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            <h1
              className="text-xl md:text-2xl font-bold break-all font-mono leading-tight"
              style={{ color: "var(--primary)", fontFamily: "var(--font-mono)" }}
            >
              {data.value}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                First: {formatDate(data.first_seen)}
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last: {formatDate(data.last_seen)}
              </div>
              <div className="flex items-center gap-1">
                <Layers className="w-3 h-3" />
                {data.source_count} source{data.source_count !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Severity block */}
            <div
              className={`flex flex-col items-center px-4 py-2.5 rounded-lg border ${sev.cls}`}
              style={{ minWidth: "80px" }}
            >
              <span className="text-2xl font-bold tabular-nums font-heading leading-none">
                {(data.severity ?? 0).toFixed(1)}
              </span>
              <span className="text-[9px] uppercase tracking-wider mt-1 font-semibold">
                {sev.label}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={toggleWatchlist}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all"
                style={{
                  background: isWatched ? "rgba(56,189,248,0.12)" : "var(--muted)",
                  border: `1px solid ${isWatched ? "rgba(56,189,248,0.3)" : "var(--border)"}`,
                  color: isWatched ? "var(--primary)" : "var(--muted-foreground)",
                }}
              >
                {isWatched ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
                {isWatched ? "Watching" : "Watch"}
              </button>
              <button
                onClick={runEnrich}
                disabled={enriching}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all disabled:opacity-50"
                style={{
                  background: "rgba(168,85,247,0.08)",
                  border: "1px solid rgba(168,85,247,0.25)",
                  color: "#c084fc",
                }}
              >
                {enriching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Enrich
              </button>
              <Link
                href={`/iocs/${id}/graph`}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all"
                style={{
                  background: "rgba(56,189,248,0.08)",
                  border: "1px solid rgba(56,189,248,0.2)",
                  color: "var(--primary)",
                }}
              >
                <Network className="w-3.5 h-3.5" />
                Graph
              </Link>
              <button
                onClick={async () => {
                  setReporting(true);
                  try {
                    await downloadReport(`/api/reports/ioc/${id}`, `ioc-${data.value.replace(/[^a-z0-9]/gi, "_")}.pdf`);
                  } catch { /* silently fail */ }
                  finally { setReporting(false); }
                }}
                disabled={reporting}
                className="flex items-center gap-2 px-3 py-2 rounded text-xs font-medium transition-all disabled:opacity-50"
                style={{
                  background: "rgba(34,197,94,0.08)",
                  border: "1px solid rgba(34,197,94,0.25)",
                  color: "#4ade80",
                }}
              >
                {reporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Score + Sources ──────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Score explanation */}
          {data.score_explanation && Object.keys(data.score_explanation).length > 0 && (
            <div
              className="rounded-lg border border-slate-700/50 overflow-hidden"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <ShieldAlert className="w-4 h-4" style={{ color: "var(--primary)" }} />
                <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                  Score Breakdown
                </h2>
              </div>
              <div className="p-4 grid sm:grid-cols-3 gap-4">
                {Object.entries(data.score_explanation).map(([key, val]) => (
                  <div key={key}>
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>
                      {key.replace(/_/g, " ")}
                    </div>
                    <div className="text-lg font-bold tabular-nums font-heading" style={{ color: "var(--foreground)" }}>
                      {typeof val === "number" ? val.toFixed(typeof val === "number" && val < 10 ? 2 : 0) : String(val)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IOC Timeline */}
          {data.sources.length > 0 && (
            <IOCTimeline
              firstSeen={data.first_seen}
              lastSeen={data.last_seen}
              sources={data.sources}
            />
          )}

          {/* Feed Observations */}
          <div
            className="rounded-lg border border-slate-700/50 overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Layers className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                Feed Observations
              </h2>
              <span
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded tabular-nums"
                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
              >
                {data.sources.length}
              </span>
            </div>
            {data.sources.length === 0 ? (
              <div
                className="flex items-center justify-center h-24 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                No feed observations recorded.
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700" style={{ borderBottom: `1px solid var(--border)` }}>
                    {["Source Feed", "Confidence", "Ingested At", "Raw Score"].map((h) => (
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
                  {data.sources.map((src, i) => (
                    <tr
                      key={src.id}
                      className="border-b border-slate-800/50"
                      style={{ borderBottom: i < data.sources.length - 1 ? `1px solid var(--border)` : undefined }}
                    >
                      <td className="px-4 py-2.5 font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                        {src.feed_name}
                      </td>
                      <td className="px-4 py-2.5">
                        {src.raw_score != null ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-10 h-1.5 rounded-full overflow-hidden"
                              style={{ background: "var(--muted)" }}
                            >
                              <div
                                className="h-full rounded-full bg-[var(--primary)]"
                                style={{ width: `${Math.min(src.raw_score * 100, 100)}%` }}
                              />
                            </div>
                            <span className="tabular-nums font-mono" style={{ color: "var(--foreground)" }}>
                              {(src.raw_score * 100).toFixed(0)}%
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--muted-foreground)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {formatDateTime(src.ingested_at)}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {src.raw_score?.toFixed(2) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Metadata */}
          {data.metadata && Object.keys(data.metadata).length > 0 && (
            <div
              className="rounded-lg border border-slate-700/50 overflow-hidden"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div
                className="px-4 py-3 border-b text-sm font-semibold font-heading"
                style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
              >
                Metadata
              </div>
              <div className="p-4">
                <pre
                  className="text-xs overflow-auto max-h-48 rounded p-3"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
                >
                  {JSON.stringify(data.metadata, null, 2)}
                </pre>
              </div>
            </div>
          )}
          {/* Enrichment card */}
          {(data.metadata?.enrichment || enrichError) && (
            <div
              className="rounded-lg border overflow-hidden"
              style={{ background: "var(--card)", borderColor: "rgba(168,85,247,0.25)" }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <Zap className="w-4 h-4" style={{ color: "#c084fc" }} />
                <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                  Enrichment
                </h2>
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: "rgba(168,85,247,0.08)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}
                >
                  {(data.metadata?.enrichment as Record<string, unknown>)?.type as string ?? "live"}
                </span>
              </div>
              <div className="p-4">
                {enrichError && (
                  <p className="text-xs" style={{ color: "#f87171" }}>{enrichError}</p>
                )}
                <EnrichmentDisplay enrichment={data.metadata?.enrichment as Record<string, unknown> | undefined} />
              </div>
            </div>
          )}

          {/* Linked Threat Actors */}
          {threatActors.length > 0 && (
            <div
              className="rounded-lg border border-slate-700/50 overflow-hidden"
              style={{ background: "var(--card)", borderColor: "var(--border)" }}
            >
              <div
                className="flex items-center gap-2 px-4 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <Users className="w-4 h-4" style={{ color: "var(--primary)" }} />
                <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                  Linked Threat Actors
                </h2>
                <span
                  className="ml-auto text-[10px] px-1.5 py-0.5 rounded tabular-nums"
                  style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
                >
                  {threatActors.length}
                </span>
              </div>
              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                {threatActors.map((actor) => (
                  <Link
                    key={actor.id}
                    href={`/threat-actors/${actor.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-all"
                    style={{ display: "flex" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <span
                      className="font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ background: "rgba(56,189,248,0.08)", color: "var(--primary)", border: "1px solid rgba(56,189,248,0.2)" }}
                    >
                      {actor.mitre_id}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{actor.name}</span>
                      {actor.country && (
                        <span className="ml-2 text-[10px]" style={{ color: "var(--muted-foreground)" }}>· {actor.country}</span>
                      )}
                    </div>
                    {actor.confidence != null && (
                      <span className="text-[9px] font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {(actor.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                    <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right: Analyst workspace ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Tags */}
          <div
            className="rounded-lg border border-slate-700/50 overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <Tag className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                Analyst Tags
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {/* Current tags */}
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {data.tags.length === 0 ? (
                  <span className="text-[10px] italic" style={{ color: "var(--muted-foreground)" }}>No tags added.</span>
                ) : (
                  data.tags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background: "rgba(56,189,248,0.10)",
                        border: "1px solid rgba(56,189,248,0.25)",
                        color: "var(--primary)",
                      }}
                    >
                      {t.tag}
                      <button
                        onClick={() => removeTag(t.id, t.tag)}
                        className="ml-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              {/* Predefined tags */}
              <div
                className="pt-2 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: "var(--muted-foreground)" }}>
                  Quick add
                </div>
                <div className="flex flex-wrap gap-1">
                  {PREDEFINED_TAGS.filter((p) => !data.tags.some((t) => t.tag === p)).map((p) => (
                    <button
                      key={p}
                      onClick={() => addTag(p)}
                      className="px-1.5 py-0.5 rounded text-[9px] transition-all hover:border-primary/50"
                      style={{
                        background: "var(--muted)",
                        border: "1px solid var(--border)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      + {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom tag input */}
              <form
                onSubmit={(e) => { e.preventDefault(); addTag(newTag); }}
                className="flex gap-1.5"
              >
                <input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Custom tag…"
                  className="flex-1 h-7 px-2 rounded text-xs border outline-none focus:border-primary transition-colors"
                  style={{ background: "var(--input)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
                <button
                  type="submit"
                  className="h-7 px-2 rounded text-[10px] font-medium transition-all"
                  style={{
                    background: "rgba(56,189,248,0.12)",
                    border: "1px solid rgba(56,189,248,0.25)",
                    color: "var(--primary)",
                  }}
                >
                  Add
                </button>
              </form>
            </div>
          </div>

          {/* Notes */}
          <div
            className="rounded-lg border border-slate-700/50 overflow-hidden"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <MessageSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
              <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
                Analyst Notes
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {/* Notes list */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {data.notes.length === 0 ? (
                  <span className="text-[10px] italic" style={{ color: "var(--muted-foreground)" }}>No notes added.</span>
                ) : (
                  data.notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded p-2.5 group"
                      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
                    >
                      {editingNoteId === note.id ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={editNoteText}
                            onChange={(e) => setEditNoteText(e.target.value)}
                            className="w-full text-xs p-1.5 rounded border outline-none resize-none"
                            style={{ background: "var(--input)", borderColor: "var(--border)", color: "var(--foreground)", minHeight: "60px" }}
                            autoFocus
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => updateNote(note.id)}
                              className="p-1 rounded transition-colors"
                              style={{ color: "#4ade80" }}
                            >
                              <Save className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingNoteId(null)}
                              className="p-1 rounded transition-colors"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--foreground)" }}>
                            {note.body}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[9px] font-mono" style={{ color: "var(--muted-foreground)" }}>
                              {formatDateTime(note.created_at)}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.body); }}
                                className="p-1 rounded"
                                style={{ color: "var(--muted-foreground)" }}
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => deleteNote(note.id)}
                                className="p-1 rounded"
                                style={{ color: "#f87171" }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add note */}
              <form
                onSubmit={addNote}
                className="space-y-1.5 pt-2 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add an analyst note…"
                  className="w-full text-xs p-2 rounded border outline-none resize-none focus:border-primary transition-colors"
                  style={{
                    background: "var(--input)",
                    borderColor: "var(--border)",
                    color: "var(--foreground)",
                    minHeight: "56px",
                  }}
                />
                <button
                  type="submit"
                  disabled={!newNote.trim()}
                  className="w-full h-7 rounded text-[10px] font-medium disabled:opacity-40 transition-all"
                  style={{
                    background: "rgba(56,189,248,0.12)",
                    border: "1px solid rgba(56,189,248,0.25)",
                    color: "var(--primary)",
                  }}
                >
                  Save Note
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
