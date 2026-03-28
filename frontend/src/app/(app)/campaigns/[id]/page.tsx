"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api.client";
import { getSeverity } from "@/lib/utils";
import {
  Network, ArrowLeft, Shield, ArrowUpRight, Users, Activity, Zap,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface CampaignIOC {
  id: string;
  value: string;
  type: string;
  severity: number | null;
  signal_types: string[];
  confidence: number | null;
}

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  confidence: number | null;
  ioc_count: number;
  status: string;
  primary_signal: string | null;
  first_seen: string | null;
  last_seen: string | null;
  techniques: Array<{ id: string }>;
  threat_actor_ids: string[];
  created_at: string;
  updated_at: string;
  top_iocs: CampaignIOC[];
  signal_breakdown: Record<string, number>;
  linked_actors: Array<{
    id: string;
    name: string;
    mitre_id: string;
    country: string | null;
    motivations: string[];
    technique_count: number;
  }>;
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const SIGNAL_LABELS: Record<string, string> = {
  subnet_clustering:   "IP Subnet /24",
  cooccurrence:        "Co-occurrence",
  malware_family:      "Malware Family",
  temporal_clustering: "Temporal Cluster",
  ttp_overlap:         "TTP Overlap",
};

const SIGNAL_WEIGHTS: Record<string, number> = {
  subnet_clustering:   0.70,
  cooccurrence:        0.90,
  malware_family:      0.85,
  temporal_clustering: 0.50,
  ttp_overlap:         0.80,
};

const SIGNAL_COLORS: Record<string, string> = {
  subnet_clustering:   "#22d3ee",
  cooccurrence:        "#a78bfa",
  malware_family:      "#f97316",
  temporal_clustering: "#f59e0b",
  ttp_overlap:         "#ef4444",
};

function confColor(conf: number | null): string {
  if (conf == null) return "#64748b";
  if (conf >= 0.75) return "#ef4444";
  if (conf >= 0.5)  return "#f97316";
  return "#f59e0b";
}

function fmt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: "rgba(34,211,238,0.06)" }}
    />
  );
}

function SevBadge({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    Critical: { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  color: "#fca5a5" },
    High:     { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", color: "#fdba74" },
    Medium:   { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", color: "#fcd34d" },
    Low:      { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", color: "#93c5fd" },
  };
  const s = styles[sev.label] ?? { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)", color: "#94a3b8" };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold leading-none"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
    >
      {sev.label}
    </span>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg overflow-hidden flex flex-col ${className}`}
      style={{ background: "rgba(8,13,28,0.8)", border: "1px solid rgba(34,211,238,0.1)" }}
    >
      {children}
    </div>
  );
}

function PanelHeader({ icon: Icon, title, subtitle }: {
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
      style={{ borderBottom: "1px solid rgba(34,211,238,0.07)", background: "rgba(34,211,238,0.015)" }}
    >
      {Icon && (
        <Icon className="w-3 h-3 flex-shrink-0" style={{ color: "#22d3ee", filter: "drop-shadow(0 0 4px rgba(34,211,238,0.5))" }} />
      )}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-mono leading-none">{title}</div>
        {subtitle && <div className="text-[8px] text-slate-700 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const { id } = params; // Next.js 14 — access directly, never use use(params)

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchApi(`/api/campaigns/${id}`)
      .then((data) => setCampaign(data))
      .catch(() => setError("Campaign not found or API unreachable."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-3 animate-in fade-in duration-400">
        <Skeleton className="h-24" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-48 col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <Network className="w-8 h-8 text-slate-800" />
        <p className="text-xs text-red-400 font-mono">{error ?? "Campaign not found."}</p>
        <Link href="/campaigns" className="text-[9px] uppercase tracking-wider font-mono px-3 py-1.5 rounded" style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", color: "#22d3ee" }}>
          ← Back to Campaigns
        </Link>
      </div>
    );
  }

  const conf = campaign.confidence ?? 0;
  const cc = confColor(campaign.confidence);
  const allSignals = Object.keys(campaign.signal_breakdown);
  const totalSigEdges = Object.values(campaign.signal_breakdown).reduce((a, b) => a + b, 0) || 1;

  // Timeline bar dimensions
  const tsFirst = campaign.first_seen ? new Date(campaign.first_seen).getTime() : null;
  const tsLast = campaign.last_seen ? new Date(campaign.last_seen).getTime() : null;
  const tsDuration = tsFirst && tsLast ? tsLast - tsFirst : null;
  const durationDays = tsDuration ? Math.ceil(tsDuration / 86400000) : null;

  return (
    <div className="space-y-3 animate-in fade-in duration-400">

      {/* ─── Back nav ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Link
          href="/campaigns"
          className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-mono transition-colors"
          style={{ color: "rgba(34,211,238,0.5)" }}
        >
          <ArrowLeft className="w-3 h-3" />
          Campaigns
        </Link>
        <span className="text-[8px] text-slate-800">/</span>
        <span className="text-[9px] font-mono text-slate-700 truncate max-w-xs">{campaign.name}</span>
      </div>

      {/* ─── Hero ──────────────────────────────────────────────────────────── */}
      <div
        className="rounded-lg px-4 py-3 relative overflow-hidden"
        style={{ background: "rgba(8,13,28,0.9)", border: "1px solid rgba(34,211,238,0.14)" }}
      >
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="text-[8px] font-mono px-2 py-0.5 rounded uppercase tracking-wider font-bold"
                style={{
                  background: campaign.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(100,116,139,0.1)",
                  color: campaign.status === "active" ? "#6ee7b7" : "#94a3b8",
                  border: `1px solid ${campaign.status === "active" ? "rgba(16,185,129,0.25)" : "rgba(100,116,139,0.25)"}`,
                }}
              >
                {campaign.status}
              </span>
              {campaign.primary_signal && (
                <span
                  className="text-[8px] font-mono px-2 py-0.5 rounded uppercase tracking-wider"
                  style={{
                    background: `${SIGNAL_COLORS[campaign.primary_signal] ?? "#64748b"}12`,
                    color: SIGNAL_COLORS[campaign.primary_signal] ?? "#94a3b8",
                    border: `1px solid ${SIGNAL_COLORS[campaign.primary_signal] ?? "#64748b"}28`,
                  }}
                >
                  {SIGNAL_LABELS[campaign.primary_signal] ?? campaign.primary_signal}
                </span>
              )}
            </div>
            <h1
              className="text-base font-bold font-mono leading-snug mb-2"
              style={{ color: "#e2e8f0", textShadow: "0 0 10px rgba(34,211,238,0.2)" }}
            >
              {campaign.name}
            </h1>
            {campaign.description && (
              <p className="text-[11px] text-slate-500 font-mono mb-2">{campaign.description}</p>
            )}
          </div>

          {/* Confidence score */}
          <div className="flex flex-col items-center flex-shrink-0 gap-1">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{
                background: `conic-gradient(${cc} ${conf * 360}deg, rgba(255,255,255,0.04) 0deg)`,
                boxShadow: `0 0 20px ${cc}30`,
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex flex-col items-center justify-center"
                style={{ background: "#060b16" }}
              >
                <span className="text-[13px] font-bold font-mono tabular-nums" style={{ color: cc }}>
                  {(conf * 100).toFixed(0)}
                </span>
                <span className="text-[7px] uppercase tracking-wider text-slate-700">conf</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="relative z-10 flex items-center gap-4 mt-3 flex-wrap">
          {[
            { label: "IOCs", value: campaign.ioc_count.toLocaleString(), color: "#22d3ee" },
            { label: "Techniques", value: campaign.techniques.length.toString(), color: "#a78bfa" },
            { label: "Linked Actors", value: campaign.linked_actors.length.toString(), color: "#f97316" },
            { label: "Signals", value: allSignals.length.toString(), color: "#10b981" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex flex-col items-start">
              <span className="text-[8px] uppercase tracking-wider text-slate-700 font-mono">{label}</span>
              <span className="text-sm font-bold font-mono tabular-nums" style={{ color, textShadow: `0 0 6px ${color}50` }}>{value}</span>
            </div>
          ))}

          {/* Timeline bar */}
          {tsFirst && tsLast && (
            <div className="flex-1 min-w-32">
              <div className="flex justify-between text-[8px] font-mono text-slate-700 mb-1">
                <span>{fmt(campaign.first_seen)}</span>
                <span>{durationDays}d span</span>
                <span>{fmt(campaign.last_seen)}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                <div className="h-full rounded-full" style={{ width: "100%", background: `linear-gradient(to right, ${cc}, rgba(34,211,238,0.4))` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main grid ─────────────────────────────────────────────────────── */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,60%) minmax(0,40%)" }}>

        {/* IOC table */}
        <Panel>
          <PanelHeader icon={Shield} title="Top IOCs" subtitle={`Top 20 by confidence · ${campaign.ioc_count} total`} />
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 360 }}>
            {campaign.top_iocs.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-slate-700">No IOCs</div>
            ) : (
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(34,211,238,0.06)" }}>
                    {["Severity", "Type", "Value", "Confidence", "Signals"].map((h) => (
                      <th key={h} className="px-3 py-1.5 text-left text-[8px] uppercase tracking-widest text-slate-700 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {campaign.top_iocs.map((ioc) => {
                    const truncated = ioc.value.length > 32 ? ioc.value.slice(0, 32) + "…" : ioc.value;
                    return (
                      <tr
                        key={ioc.id}
                        className="group transition-colors"
                        style={{ borderBottom: "1px solid rgba(34,211,238,0.04)" }}
                      >
                        <td className="px-3 py-1.5"><SevBadge score={ioc.severity} /></td>
                        <td className="px-3 py-1.5">
                          <span className="px-1 py-0.5 rounded text-[8px]" style={{ background: "rgba(34,211,238,0.06)", color: "rgba(34,211,238,0.55)" }}>
                            {ioc.type.replace("hash_", "")}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <Link href={`/iocs/${ioc.id}`} className="flex items-center gap-1 group-hover:text-cyan-300 transition-colors" style={{ color: "#67e8f9" }} title={ioc.value}>
                            {truncated}
                            <ArrowUpRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                        </td>
                        <td className="px-3 py-1.5">
                          <span style={{ color: confColor(ioc.confidence) }}>
                            {ioc.confidence != null ? `${(ioc.confidence * 100).toFixed(0)}%` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex gap-0.5 flex-wrap">
                            {ioc.signal_types.map((s) => (
                              <span key={s} className="px-1 py-0.5 rounded text-[7px]" style={{ background: `${SIGNAL_COLORS[s] ?? "#64748b"}12`, color: SIGNAL_COLORS[s] ?? "#64748b" }}>
                                {SIGNAL_LABELS[s] ?? s}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Panel>

        {/* Right column */}
        <div className="space-y-2">

          {/* Signal breakdown */}
          <Panel>
            <PanelHeader icon={Activity} title="Signal Breakdown" subtitle="Which detectors fired" />
            <div className="px-3 py-2.5 space-y-2">
              {Object.entries(campaign.signal_breakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([sig, count]) => {
                  const color = SIGNAL_COLORS[sig] ?? "#64748b";
                  const pct = Math.round((count / totalSigEdges) * 100);
                  const weight = SIGNAL_WEIGHTS[sig];
                  return (
                    <div key={sig}>
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                          <span className="text-[9px] font-mono text-slate-400">{SIGNAL_LABELS[sig] ?? sig}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[8px] font-mono">
                          <span style={{ color }}>{count} edges</span>
                          {weight != null && (
                            <span className="text-slate-700">w={weight.toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 4px ${color}80` }} />
                      </div>
                    </div>
                  );
                })}
              {allSignals.length === 0 && (
                <p className="text-[9px] text-slate-700 font-mono">No signal data</p>
              )}
            </div>
          </Panel>

          {/* Linked threat actors */}
          <Panel>
            <PanelHeader icon={Users} title="Linked Threat Actors" subtitle="Via TTP / IOC linkage" />
            <div className="px-3 py-2.5 space-y-2">
              {campaign.linked_actors.length === 0 ? (
                <p className="text-[9px] text-slate-700 font-mono">No linked actors</p>
              ) : (
                campaign.linked_actors.map((actor) => (
                  <Link
                    key={actor.id}
                    href={`/threat-actors/${actor.id}`}
                    className="flex items-center justify-between gap-2 group"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0"
                        style={{ background: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}
                      >
                        {actor.mitre_id}
                      </span>
                      <span className="text-[10px] font-mono text-slate-300 truncate group-hover:text-cyan-300 transition-colors">{actor.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {actor.country && <span className="text-[8px] text-slate-700 font-mono">{actor.country}</span>}
                      <span className="text-[8px] font-mono text-slate-600">{actor.technique_count} TTPs</span>
                      <ArrowUpRight className="w-2.5 h-2.5 text-slate-700 group-hover:text-cyan-400 transition-colors" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Panel>

          {/* Techniques */}
          {campaign.techniques.length > 0 && (
            <Panel>
              <PanelHeader icon={Zap} title="MITRE Techniques" subtitle="Shared across linked actors" />
              <div className="px-3 py-2.5 flex flex-wrap gap-1">
                {campaign.techniques.map((t) => (
                  <span
                    key={t.id}
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(167,139,250,0.08)", color: "#c4b5fd", border: "1px solid rgba(167,139,250,0.15)" }}
                  >
                    {t.id}
                  </span>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
