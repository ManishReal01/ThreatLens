"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity } from "@/lib/utils";
import {
  ArrowLeft, Globe, Target, Shield, Cpu, ExternalLink,
  AlertTriangle, ChevronRight, ChevronLeft,
} from "lucide-react";
import Link from "next/link";
import { use } from "react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Technique { id: string; name: string }
interface Software  { id: string; name: string }
interface ThreatActorDetail {
  id: string;
  mitre_id: string;
  name: string;
  aliases: string[];
  description: string | null;
  country: string | null;
  motivations: string[];
  first_seen: string | null;
  last_seen: string | null;
  techniques: Technique[];
  software: Software[];
  associated_malware: string[];
  metadata: Record<string, unknown> | null;
  linked_ioc_count: number;
}
interface IOCListItem {
  id: string;
  value: string;
  type: string;
  severity: number | null;
  first_seen: string;
  last_seen: string;
  source_count: number;
}
interface PaginatedIOCs {
  items: IOCListItem[];
  total: number;
  page: number;
  pages: number;
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Sk({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─── Section card ──────────────────────────────────────────────────────── */
function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700/50 p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--primary)" }} />
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

/* ─── IOC severity badge ─────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null }) {
  const sev = getSeverity(score);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${sev.cls}`}>
      <span className={`w-1 h-1 rounded-full ${sev.dotCls}`} />
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
  const cls = TYPE_COLORS[type] ?? "bg-muted/20 text-muted-foreground border-muted/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${cls}`}>
      {type.replace("hash_", "")}
    </span>
  );
}

/* ─── Detail page ────────────────────────────────────────────────────────── */
export default function ThreatActorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [actor, setActor] = useState<ThreatActorDetail | null>(null);
  const [iocs, setIocs] = useState<PaginatedIOCs | null>(null);
  const [loadingActor, setLoadingActor] = useState(true);
  const [loadingIocs, setLoadingIocs] = useState(false);
  const [iocPage, setIocPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoadingActor(true);
    fetchApi(`/api/threat-actors/${id}`)
      .then(setActor)
      .catch((e) => setError(e.message))
      .finally(() => setLoadingActor(false));
  }, [id]);

  useEffect(() => {
    if (!actor) return;
    setLoadingIocs(true);
    fetchApi(`/api/threat-actors/${id}/iocs?page=${iocPage}&page_size=10`)
      .then(setIocs)
      .catch(() => {/* silently fail ioc section */})
      .finally(() => setLoadingIocs(false));
  }, [id, actor, iocPage]);

  if (loadingActor) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Sk className="h-6 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Sk className="h-40 rounded-lg" />
            <Sk className="h-32 rounded-lg" />
          </div>
          <Sk className="h-64 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !actor) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "#f87171" }} />
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {error || "Threat actor not found"}
        </p>
        <Link href="/threat-actors" className="text-xs mt-2 inline-block" style={{ color: "var(--primary)" }}>
          ← Back to Threat Actors
        </Link>
      </div>
    );
  }

  const mitreUrl = actor.metadata?.url as string | undefined;

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Back link */}
      <Link
        href="/threat-actors"
        className="inline-flex items-center gap-1.5 text-xs transition-colors"
        style={{ color: "var(--muted-foreground)" }}
      >
        <ArrowLeft className="w-3 h-3" />
        Threat Actors
      </Link>

      {/* Page header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className="font-mono text-xs px-2 py-0.5 rounded"
              style={{ background: "rgba(56,189,248,0.08)", color: "var(--primary)", border: "1px solid rgba(56,189,248,0.2)" }}
            >
              {actor.mitre_id}
            </span>
            {actor.country && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider"
                style={{ background: "rgba(148,163,184,0.1)", border: "1px solid rgba(148,163,184,0.2)", color: "var(--muted-foreground)" }}
              >
                <Globe className="w-2.5 h-2.5" />
                {actor.country}
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold font-heading" style={{ color: "var(--foreground)" }}>
            {actor.name}
          </h1>
          {actor.aliases.length > 0 && (
            <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Also known as: {actor.aliases.join(", ")}
            </p>
          )}
        </div>

        {mitreUrl && (
          <a
            href={mitreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors"
            style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
          >
            <ExternalLink className="w-3 h-3" />
            MITRE ATT&CK
          </a>
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column — description + techniques + software */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          {actor.description && (
            <Section title="Description" icon={Shield}>
              <p className="text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
                {actor.description}
              </p>
            </Section>
          )}

          {/* Techniques (TTPs) */}
          <Section title={`Techniques (${actor.techniques.length})`} icon={Target}>
            {actor.techniques.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No techniques recorded</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                {actor.techniques.map((t) => (
                  <a
                    key={t.id}
                    href={`https://attack.mitre.org/techniques/${t.id.replace(".", "/")}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono transition-colors"
                    style={{
                      background: "rgba(56,189,248,0.06)",
                      border: "1px solid rgba(56,189,248,0.18)",
                      color: "var(--primary)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.14)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.06)";
                    }}
                  >
                    {t.id}
                  </a>
                ))}
              </div>
            )}
          </Section>

          {/* Software / Tools */}
          <Section title={`Tools & Software (${actor.software.length})`} icon={Cpu}>
            {actor.software.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>No tools recorded</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {actor.software.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[10px]"
                    style={{
                      background: "rgba(168,85,247,0.08)",
                      border: "1px solid rgba(168,85,247,0.2)",
                      color: "#c084fc",
                    }}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* Linked IOCs */}
          <Section title={`Linked IOCs (${actor.linked_ioc_count})`} icon={Target}>
            {loadingIocs ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Sk key={i} className="h-10 w-full rounded" />)}
              </div>
            ) : iocs && iocs.items.length > 0 ? (
              <>
                <div className="space-y-1">
                  {iocs.items.map((ioc) => (
                    <Link
                      key={ioc.id}
                      href={`/iocs/${ioc.id}`}
                      className="flex items-center gap-3 px-3 py-2 rounded transition-all"
                      style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "rgba(56,189,248,0.3)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      }}
                    >
                      <TypeBadge type={ioc.type} />
                      <span className="flex-1 font-mono text-xs truncate" style={{ color: "var(--foreground)" }}>
                        {ioc.value}
                      </span>
                      <SevBadge score={ioc.severity} />
                      <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: "var(--muted-foreground)" }} />
                    </Link>
                  ))}
                </div>
                {iocs.pages > 1 && (
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      Page {iocs.page} of {iocs.pages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        disabled={iocs.page <= 1}
                        onClick={() => setIocPage(p => p - 1)}
                        className="p-1 rounded disabled:opacity-30"
                        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                      >
                        <ChevronLeft className="w-3 h-3" style={{ color: "var(--foreground)" }} />
                      </button>
                      <button
                        disabled={iocs.page >= iocs.pages}
                        onClick={() => setIocPage(p => p + 1)}
                        className="p-1 rounded disabled:opacity-30"
                        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
                      >
                        <ChevronRight className="w-3 h-3" style={{ color: "var(--foreground)" }} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                No IOCs linked yet. IOC links are built from malware family matches (ThreatFox data).
              </p>
            )}
          </Section>
        </div>

        {/* Right column — metadata */}
        <div className="space-y-4">
          {/* Quick facts */}
          <div className="rounded-lg border border-slate-700/50 p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <span className="text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: "var(--muted-foreground)" }}>
              Quick Facts
            </span>

            <div className="space-y-3 pt-1">
              {/* Motivation */}
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-1" style={{ color: "var(--muted-foreground)" }}>Motivation</p>
                {actor.motivations.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {actor.motivations.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider"
                        style={{ background: "rgba(168,85,247,0.08)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.2)" }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>Unknown</span>
                )}
              </div>

              {/* First / last seen */}
              {actor.first_seen && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>First Seen</p>
                  <p className="text-xs font-mono" style={{ color: "var(--foreground)" }}>
                    {actor.first_seen.slice(0, 10)}
                  </p>
                </div>
              )}
              {actor.last_seen && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>Last Seen</p>
                  <p className="text-xs font-mono" style={{ color: "var(--foreground)" }}>
                    {actor.last_seen.slice(0, 10)}
                  </p>
                </div>
              )}

              {/* Technique count */}
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>Techniques</p>
                <p className="text-xs font-mono" style={{ color: "var(--foreground)" }}>{actor.techniques.length}</p>
              </div>

              {/* Linked IOCs */}
              <div>
                <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: "var(--muted-foreground)" }}>Linked IOCs</p>
                <p className="text-xs font-mono" style={{ color: actor.linked_ioc_count > 0 ? "var(--primary)" : "var(--foreground)" }}>
                  {actor.linked_ioc_count}
                </p>
              </div>
            </div>
          </div>

          {/* Associated malware */}
          {actor.associated_malware.length > 0 && (
            <div className="rounded-lg border border-slate-700/50 p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <span className="text-[9px] uppercase tracking-[0.15em] font-semibold" style={{ color: "var(--muted-foreground)" }}>
                Associated Malware
              </span>
              <div className="flex flex-wrap gap-1 mt-2">
                {actor.associated_malware.map((m) => (
                  <span
                    key={m}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* MITRE link */}
          {mitreUrl && (
            <a
              href={mitreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 rounded border border-slate-700/50 text-xs transition-all w-full"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(56,189,248,0.3)";
                (e.currentTarget as HTMLElement).style.color = "var(--primary)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
              }}
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span>View on MITRE ATT&CK</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
