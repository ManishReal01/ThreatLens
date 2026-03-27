"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity } from "@/lib/utils";
import {
  ArrowLeft, Globe, Target, Cpu, ExternalLink,
  AlertTriangle, ChevronRight, ChevronLeft,
  FileDown, Loader2, Calendar, Activity,
} from "lucide-react";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:8000";

async function downloadReport(endpoint: string, filename: string) {
  const res  = await fetch(`${BACKEND_URL}${endpoint}`, { method: "POST" });
  if (!res.ok) throw new Error(`Report failed: ${res.status}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Technique { id: string; name: string }
interface Software  { id: string; name: string }
interface ThreatActorDetail {
  id: string; mitre_id: string; name: string; aliases: string[];
  description: string | null; country: string | null; motivations: string[];
  first_seen: string | null; last_seen: string | null;
  techniques: Technique[]; software: Software[]; associated_malware: string[];
  metadata: Record<string, unknown> | null; linked_ioc_count: number;
}
interface IOCListItem {
  id: string; value: string; type: string;
  severity: number | null; first_seen: string; last_seen: string; source_count: number;
}
interface PaginatedIOCs {
  items: IOCListItem[]; total: number; page: number; pages: number;
}

/* ─── Motivation color map ───────────────────────────────────────────────── */
function motivStyle(m: string) {
  const key = m.toLowerCase().replace(/\s+/g, "-");
  const map: Record<string, { bg: string; border: string; text: string }> = {
    "financial-gain":  { bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.35)",  text: "#4ade80" },
    "espionage":       { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
    "cyber-espionage": { bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.35)", text: "#60a5fa" },
    "destructive":     { bg: "rgba(239,68,68,0.1)",   border: "rgba(239,68,68,0.35)",  text: "#f87171" },
    "hacktivism":      { bg: "rgba(251,146,60,0.1)",  border: "rgba(251,146,60,0.35)", text: "#fb923c" },
    "nation-state":    { bg: "rgba(34,211,238,0.08)", border: "rgba(34,211,238,0.28)", text: "#22d3ee" },
    "ideology":        { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.22)", text: "#fb923c" },
  };
  return map[key] ?? { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.28)", text: "#c084fc" };
}

/* ─── Severity badge ─────────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null }) {
  const sev = getSeverity(score);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${sev.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${sev.dotCls}`} />
      {sev.label}
    </span>
  );
}

/* ─── Type badge ─────────────────────────────────────────────────────────── */
const TYPE_COLORS: Record<string, string> = {
  ip:          "bg-sky-500/10 text-sky-400 border-sky-500/20",
  domain:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
  url:         "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  hash_md5:    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha1:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
  hash_sha256: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};
function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_COLORS[type] ?? "bg-slate-500/10 text-slate-400 border-slate-500/20";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${cls}`}>
      {type.replace("hash_", "")}
    </span>
  );
}

/* ─── Timeline bar ───────────────────────────────────────────────────────── */
function TimelineBar({ firstSeen, lastSeen }: { firstSeen: string; lastSeen: string }) {
  const start   = new Date(firstSeen).getTime();
  const end     = new Date(lastSeen).getTime();
  const now     = Date.now();
  const total   = now - start;
  const pct     = total > 0 ? Math.min(100, Math.max(5, ((end - start) / total) * 100)) : 100;
  const isActive = end >= now - 1000 * 60 * 60 * 24 * 90;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div className="space-y-2">
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(15,23,42,0.8)" }}>
        {/* Track */}
        <div className="absolute inset-0 rounded-full" style={{ background: "rgba(30,41,59,0.6)" }} />
        {/* Activity bar */}
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: isActive
              ? "linear-gradient(90deg, rgba(34,211,238,0.35), rgba(34,211,238,0.75))"
              : "linear-gradient(90deg, rgba(34,211,238,0.2), rgba(34,211,238,0.5))",
            boxShadow: isActive ? "0 0 10px rgba(34,211,238,0.3)" : "0 0 6px rgba(34,211,238,0.15)",
          }}
        />
        {/* Endpoint marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 rounded-full"
          style={{
            left: `calc(${pct}% - 1px)`,
            background: isActive ? "#4ade80" : "rgba(34,211,238,0.9)",
            boxShadow: isActive ? "0 0 6px #4ade80" : "0 0 6px rgba(34,211,238,0.6)",
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono" style={{ color: "#334155" }}>
          {fmt(firstSeen)}
        </span>
        <span className="flex items-center gap-1 text-[9px] font-mono" style={{ color: isActive ? "#4ade80" : "#334155" }}>
          {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          {isActive ? "Still active" : fmt(lastSeen)}
        </span>
      </div>
    </div>
  );
}

/* ─── Section card ───────────────────────────────────────────────────────── */
function Section({ title, icon: Icon, count, accent, children }: {
  title: string;
  icon: React.ElementType;
  count?: number;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl p-5 space-y-4"
      style={{
        background: "rgba(8,14,28,0.95)",
        border: `1px solid ${accent ?? "rgba(34,211,238,0.08)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5" style={{ color: accent ? accent.replace("0.08", "0.7").replace("0.12","0.7") : "#22d3ee" }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>
            {title}
          </span>
        </div>
        {count !== undefined && (
          <span
            className="font-mono text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.1)", color: "#22d3ee" }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
// Next.js 14: params is a plain object — never use use(params)
export default function ThreatActorDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [actor, setActor]               = useState<ThreatActorDetail | null>(null);
  const [iocs, setIocs]                 = useState<PaginatedIOCs | null>(null);
  const [loadingActor, setLoadingActor] = useState(true);
  const [loadingIocs, setLoadingIocs]   = useState(false);
  const [iocPage, setIocPage]           = useState(1);
  const [error, setError]               = useState<string | null>(null);
  const [reporting, setReporting]       = useState(false);

  useEffect(() => {
    setLoadingActor(true);
    fetchApi(`/api/threat-actors/${id}`)
      .then(setActor)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load actor"))
      .finally(() => setLoadingActor(false));
  }, [id]);

  useEffect(() => {
    if (!actor) return;
    setLoadingIocs(true);
    fetchApi(`/api/threat-actors/${id}/iocs?page=${iocPage}&page_size=10`)
      .then(setIocs)
      .catch(() => {})
      .finally(() => setLoadingIocs(false));
  }, [id, actor, iocPage]);

  /* ── Loading skeleton ── */
  if (loadingActor) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Sk className="h-5 w-40 rounded" />
        <Sk className="h-52 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Sk className="h-40 rounded-xl" />
            <Sk className="h-32 rounded-xl" />
          </div>
          <div className="space-y-4">
            <Sk className="h-56 rounded-xl" />
            <Sk className="h-28 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Error state ── */
  if (error || !actor) {
    return (
      <div className="text-center py-24">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#f87171" }} />
        <p className="text-sm" style={{ color: "#64748b" }}>{error || "Threat actor not found"}</p>
        <Link href="/threat-actors" className="text-xs mt-2 inline-block hover:text-cyan-300 transition-colors" style={{ color: "#22d3ee" }}>
          ← Back to Threat Actors
        </Link>
      </div>
    );
  }

  const mitreUrl = actor.metadata?.url as string | undefined;

  return (
    <div className="space-y-5 max-w-5xl animate-in fade-in duration-400">

      {/* Back */}
      <Link
        href="/threat-actors"
        className="inline-flex items-center gap-1.5 text-xs transition-colors hover:text-cyan-300"
        style={{ color: "#334155" }}
      >
        <ArrowLeft className="w-3 h-3" />
        Threat Actors
      </Link>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-7 relative overflow-hidden"
        style={{
          background: "rgba(8,14,28,0.98)",
          border: "1px solid rgba(34,211,238,0.14)",
          boxShadow: "inset 0 0 100px rgba(34,211,238,0.025)",
        }}
      >
        {/* Grid texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(34,211,238,0.06) 1px, transparent 0)",
            backgroundSize: "28px 28px",
            opacity: 0.4,
          }}
        />
        {/* Ambient glow */}
        <div
          className="absolute -top-12 left-1/3 w-80 h-40 pointer-events-none"
          style={{ background: "radial-gradient(ellipse, rgba(34,211,238,0.04) 0%, transparent 70%)" }}
        />

        <div className="relative">
          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span
              className="font-mono text-[11px] px-2.5 py-1 rounded-lg font-bold tracking-wider"
              style={{ background: "rgba(34,211,238,0.07)", border: "1px solid rgba(34,211,238,0.22)", color: "#22d3ee" }}
            >
              {actor.mitre_id}
            </span>
            {actor.country && (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider font-semibold"
                style={{ background: "rgba(71,85,105,0.2)", border: "1px solid rgba(71,85,105,0.38)", color: "#94a3b8" }}
              >
                <Globe className="w-3 h-3" />
                {actor.country}
              </span>
            )}
            {actor.motivations.map((m) => {
              const c = motivStyle(m);
              return (
                <span
                  key={m}
                  className="text-[10px] px-2.5 py-1 rounded-lg uppercase tracking-wider font-bold"
                  style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.text }}
                >
                  {m.replace(/-/g, " ")}
                </span>
              );
            })}
          </div>

          {/* Name */}
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: "var(--font-heading)", color: "#f1f5f9" }}>
            {actor.name}
          </h1>

          {/* Aliases */}
          {actor.aliases.length > 0 && (
            <p className="text-[11px] font-mono mb-5" style={{ color: "#334155" }}>
              Also known as:{" "}
              <span style={{ color: "#475569" }}>{actor.aliases.join(", ")}</span>
            </p>
          )}

          {/* Stat pills */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" style={{ color: "#22d3ee" }} />
              <span className="text-[11px] font-mono" style={{ color: "#475569" }}>
                <span style={{ color: "#e2e8f0" }}>{actor.techniques.length}</span> techniques
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" style={{ color: actor.linked_ioc_count > 0 ? "#22d3ee" : "#334155" }} />
              <span className="text-[11px] font-mono" style={{ color: "#475569" }}>
                <span style={{ color: actor.linked_ioc_count > 0 ? "#22d3ee" : "#64748b" }}>
                  {actor.linked_ioc_count}
                </span>{" "}
                linked IOCs
              </span>
            </div>
            {actor.software.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" style={{ color: "#475569" }} />
                <span className="text-[11px] font-mono" style={{ color: "#475569" }}>
                  <span style={{ color: "#e2e8f0" }}>{actor.software.length}</span> tools
                </span>
              </div>
            )}
          </div>

          {/* Description */}
          {actor.description && (
            <p
              className="text-[12px] leading-relaxed mb-6"
              style={{ color: "#94a3b8", maxWidth: "72ch" }}
            >
              {actor.description}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {mitreUrl && (
              <a
                href={mitreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ background: "rgba(34,211,238,0.05)", border: "1px solid rgba(34,211,238,0.18)", color: "#64748b" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.4)";
                  (e.currentTarget as HTMLElement).style.color = "#22d3ee";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.18)";
                  (e.currentTarget as HTMLElement).style.color = "#64748b";
                }}
              >
                <ExternalLink className="w-3 h-3" />
                MITRE ATT&amp;CK
              </a>
            )}
            <button
              onClick={async () => {
                setReporting(true);
                try {
                  const safeName = actor.name.replace(/[^a-z0-9]/gi, "_");
                  await downloadReport(`/api/reports/threat-actor/${id}`, `threat-actor-${safeName}.pdf`);
                } catch { /* silently fail */ }
                finally { setReporting(false); }
              }}
              disabled={reporting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50"
              style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.22)", color: "#4ade80" }}
            >
              {reporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileDown className="w-3 h-3" />}
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">

          {/* Techniques grid */}
          <Section title="Techniques (TTPs)" icon={Target} count={actor.techniques.length}>
            {actor.techniques.length === 0 ? (
              <p className="text-[11px]" style={{ color: "#334155" }}>No techniques recorded</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {actor.techniques.map((t) => (
                  <a
                    key={t.id}
                    href={`https://attack.mitre.org/techniques/${t.id.replace(".", "/")}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex flex-col gap-1.5 p-2.5 rounded-lg transition-all"
                    style={{
                      background: "rgba(34,211,238,0.02)",
                      border: "1px solid rgba(34,211,238,0.08)",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "rgba(34,211,238,0.07)";
                      el.style.borderColor = "rgba(34,211,238,0.28)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "rgba(34,211,238,0.02)";
                      el.style.borderColor = "rgba(34,211,238,0.08)";
                    }}
                  >
                    <span className="font-mono text-[9px] font-bold" style={{ color: "#22d3ee" }}>
                      {t.id}
                    </span>
                    <span
                      className="text-[10px] leading-tight transition-colors group-hover:text-cyan-200"
                      style={{ color: "#64748b" }}
                    >
                      {t.name}
                    </span>
                    <ExternalLink
                      className="w-2.5 h-2.5 self-end opacity-0 group-hover:opacity-40 transition-opacity"
                      style={{ color: "#22d3ee" }}
                    />
                  </a>
                ))}
              </div>
            )}
          </Section>

          {/* Software / Tools */}
          {actor.software.length > 0 && (
            <Section title="Tools & Software" icon={Cpu} count={actor.software.length}>
              <div className="flex flex-wrap gap-1.5">
                {actor.software.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-mono"
                    style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.2)", color: "#c084fc" }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Linked IOCs */}
          <Section title="Linked IOCs" icon={Activity} count={actor.linked_ioc_count}>
            {loadingIocs ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Sk key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : iocs && iocs.items.length > 0 ? (
              <>
                <div className="space-y-1.5">
                  {iocs.items.map((ioc) => (
                    <Link
                      key={ioc.id}
                      href={`/iocs/${ioc.id}`}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                      style={{ background: "rgba(12,20,38,0.7)", border: "1px solid rgba(34,211,238,0.05)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.22)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(12,20,38,0.95)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.05)";
                        (e.currentTarget as HTMLElement).style.background = "rgba(12,20,38,0.7)";
                      }}
                    >
                      <TypeBadge type={ioc.type} />
                      <span className="flex-1 font-mono text-[11px] truncate" style={{ color: "#e2e8f0" }}>
                        {ioc.value}
                      </span>
                      <SevBadge score={ioc.severity} />
                      <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "#1e293b" }} />
                    </Link>
                  ))}
                </div>
                {iocs.pages > 1 && (
                  <div
                    className="flex items-center justify-between mt-3 pt-3"
                    style={{ borderTop: "1px solid rgba(34,211,238,0.05)" }}
                  >
                    <span className="text-[10px] font-mono" style={{ color: "#334155" }}>
                      Page {iocs.page} of {iocs.pages}
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        disabled={iocs.page <= 1}
                        onClick={() => setIocPage((p) => p - 1)}
                        className="p-1.5 rounded-lg disabled:opacity-30 transition-all"
                        style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.1)" }}
                      >
                        <ChevronLeft className="w-3 h-3" style={{ color: "#e2e8f0" }} />
                      </button>
                      <button
                        disabled={iocs.page >= iocs.pages}
                        onClick={() => setIocPage((p) => p + 1)}
                        className="p-1.5 rounded-lg disabled:opacity-30 transition-all"
                        style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.1)" }}
                      >
                        <ChevronRight className="w-3 h-3" style={{ color: "#e2e8f0" }} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[11px]" style={{ color: "#334155" }}>
                No IOCs linked yet. IOC links are built from malware family matches (ThreatFox data).
              </p>
            )}
          </Section>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Profile card */}
          <div
            className="rounded-xl p-5 space-y-5"
            style={{ background: "rgba(8,14,28,0.95)", border: "1px solid rgba(34,211,238,0.08)" }}
          >
            <span className="text-[9px] uppercase tracking-[0.18em] font-semibold" style={{ color: "#2d3f5a" }}>
              Profile
            </span>

            {/* Activity timeline */}
            {actor.first_seen && actor.last_seen && (
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: "#334155" }}>
                  <Calendar className="w-2.5 h-2.5" />
                  Activity Window
                </p>
                <TimelineBar firstSeen={actor.first_seen} lastSeen={actor.last_seen} />
              </div>
            )}

            {/* Origin */}
            {actor.country && (
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: "#334155" }}>Origin</p>
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-mono uppercase tracking-wider font-semibold"
                  style={{ background: "rgba(51,65,85,0.2)", border: "1px solid rgba(51,65,85,0.38)", color: "#64748b" }}
                >
                  <Globe className="w-2.5 h-2.5" />
                  {actor.country}
                </span>
              </div>
            )}

            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className="rounded-lg p-3 text-center"
                style={{ background: "rgba(34,211,238,0.04)", border: "1px solid rgba(34,211,238,0.08)" }}
              >
                <p className="text-xl font-bold font-mono" style={{ color: "#22d3ee" }}>
                  {actor.techniques.length}
                </p>
                <p className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: "#1e293b" }}>
                  Techniques
                </p>
              </div>
              <div
                className="rounded-lg p-3 text-center"
                style={{
                  background: actor.linked_ioc_count > 0 ? "rgba(34,211,238,0.04)" : "rgba(12,20,38,0.5)",
                  border: `1px solid ${actor.linked_ioc_count > 0 ? "rgba(34,211,238,0.08)" : "rgba(20,30,50,0.6)"}`,
                }}
              >
                <p
                  className="text-xl font-bold font-mono"
                  style={{ color: actor.linked_ioc_count > 0 ? "#22d3ee" : "#1e293b" }}
                >
                  {actor.linked_ioc_count}
                </p>
                <p className="text-[8px] uppercase tracking-wider mt-0.5" style={{ color: "#1e293b" }}>
                  Linked IOCs
                </p>
              </div>
            </div>

            {/* MITRE link */}
            {mitreUrl && (
              <a
                href={mitreUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs transition-all"
                style={{ background: "rgba(34,211,238,0.03)", border: "1px solid rgba(34,211,238,0.1)", color: "#334155" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.3)";
                  (e.currentTarget as HTMLElement).style.color = "#22d3ee";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.1)";
                  (e.currentTarget as HTMLElement).style.color = "#334155";
                }}
              >
                <ExternalLink className="w-3 h-3" />
                View on MITRE ATT&amp;CK
              </a>
            )}
          </div>

          {/* Associated malware */}
          {actor.associated_malware.length > 0 && (
            <div
              className="rounded-xl p-5"
              style={{
                background: "rgba(8,14,28,0.95)",
                border: "1px solid rgba(239,68,68,0.12)",
                boxShadow: "inset 0 0 40px rgba(239,68,68,0.02)",
              }}
            >
              <p className="text-[9px] uppercase tracking-[0.18em] font-semibold mb-3" style={{ color: "#475569" }}>
                Associated Malware
              </p>
              <div className="flex flex-wrap gap-1.5">
                {actor.associated_malware.map((m) => (
                  <span
                    key={m}
                    className="text-[10px] px-2.5 py-1 rounded-lg font-mono"
                    style={{
                      background: "rgba(239,68,68,0.06)",
                      border: "1px solid rgba(239,68,68,0.18)",
                      color: "#f87171",
                      boxShadow: "0 0 10px rgba(239,68,68,0.06)",
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
