"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatRelativeTime } from "@/lib/utils";
import {
  Activity, RefreshCw, Zap, Shield, Database,
  AlertTriangle, ArrowUpRight, MapPin, Radio, Users,
} from "lucide-react";
import Link from "next/link";

const GeoMap = dynamic(() => import("@/components/GeoMap"), { ssr: false });
const TrendChart = dynamic(() => import("@/components/TrendChart"), { ssr: false });

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface FeedHealth {
  feed_name: string;
  last_run_at: string | null;
  last_run_status: string | null;
  last_iocs_fetched: number | null;
  last_iocs_new: number | null;
  last_error_msg: string | null;
  total_iocs: number;
}

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

interface Stats {
  total_iocs: number;
  iocs_by_type: Record<string, number>;
  iocs_by_severity: Record<string, number>;
}

interface GeoIPPoint {
  value: string;
  latitude: number;
  longitude: number;
  severity: number | null;
  feed_source: string;
  country?: string | null;
}

interface TrendPoint {
  date: string;
  count: number;
}

interface ActivityEvent {
  ioc_id: string;
  ioc_value: string;
  ioc_type: string;
  severity: number | null;
  feed_name: string;
  ingested_at: string;
}

interface ThreatActor {
  id: string;
  name: string;
  mitre_id: string;
  country: string | null;
  linked_ioc_count: number;
  aliases: string[];
  motivations: string[];
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─── Feed name map ──────────────────────────────────────────────────────── */
const FEED_DISPLAY: Record<string, { label: string }> = {
  abuseipdb: { label: "AbuseIPDB" },
  urlhaus:   { label: "URLhaus" },
  otx:       { label: "AlienVault OTX" },
  threatfox: { label: "ThreatFox" },
};

/* ─── Severity dot ───────────────────────────────────────────────────────── */
function SevDot({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  const color =
    sev.label === "Critical" ? "#ef4444" :
    sev.label === "High"     ? "#f97316" :
    sev.label === "Medium"   ? "#f59e0b" :
    sev.label === "Low"      ? "#3b82f6" : "#64748b";
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ background: color, boxShadow: `0 0 4px ${color}90` }}
    />
  );
}

/* ─── Severity badge (compact inline) ───────────────────────────────────── */
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
      {sev.label}
    </span>
  );
}

/* ─── Panel wrapper ──────────────────────────────────────────────────────── */
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg overflow-hidden flex flex-col ${className}`}
      style={{
        background: "rgba(10,16,32,0.7)",
        border: "1px solid rgba(34,211,238,0.1)",
        backdropFilter: "blur(4px)",
      }}
    >
      {children}
    </div>
  );
}

/* ─── Panel header ───────────────────────────────────────────────────────── */
function PanelHeader({
  icon: Icon,
  title,
  subtitle,
  right,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 flex-shrink-0"
      style={{
        borderBottom: "1px solid rgba(34,211,238,0.08)",
        background: "rgba(34,211,238,0.02)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon className="w-3 h-3 text-cyan-500 flex-shrink-0" />}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-mono leading-none">
            {title}
          </div>
          {subtitle && <div className="text-[8px] text-slate-600 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feeds, setFeeds] = useState<FeedHealth[]>([]);
  const [recentIOCs, setRecentIOCs] = useState<IOCListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [geoPoints, setGeoPoints] = useState<GeoIPPoint[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [threatActors, setThreatActors] = useState<ThreatActor[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [feedRes, recentRes, statsRes, geoRes, trendsRes, activityRes, actorsRes] = await Promise.all([
          fetchApi("/api/feeds/health"),
          fetchApi("/api/iocs?page_size=8&severity_min=7"),
          fetchApi("/api/stats"),
          fetchApi("/api/stats/geoip").catch(() => []),
          fetchApi("/api/stats/trends").catch(() => ({ trends: [] })),
          fetchApi("/api/stats/activity").catch(() => ({ events: [] })),
          fetchApi("/api/threat-actors?page_size=5").catch(() => ({ items: [] })),
        ]);

        setFeeds(feedRes?.feeds ?? []);
        setRecentIOCs(recentRes?.items ?? []);
        setStats(statsRes ?? null);
        setGeoPoints(Array.isArray(geoRes) ? geoRes : []);
        setTrends(trendsRes?.trends ?? []);
        setActivity(activityRes?.events ?? []);
        setThreatActors(actorsRes?.items ?? []);
      } catch (err) {
        console.error(err);
        setError("Could not reach the backend. Ensure the API is running at http://127.0.0.1:8000");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleSync = async (feedName: string) => {
    setSyncing(true);
    try {
      await fetchApi(`/api/feeds/${feedName}/trigger`, { method: "POST" });
    } catch { /* ignore */ }
    setTimeout(() => setSyncing(false), 2000);
  };

  /* ── Error ─────────────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="flex items-center gap-3 px-5 py-4 rounded-lg border text-sm bg-red-950/20 border-red-800/40 text-red-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  /* ── Loading ────────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" />
        <Skeleton className="h-8" />
        <div className="grid gap-2" style={{ gridTemplateColumns: "70% 1fr" }}>
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const maxActorCount = Math.max(...threatActors.map((a) => a.linked_ioc_count), 1);

  return (
    <div className="space-y-2 animate-in fade-in duration-400">

      {/* ═══ ROW 1 — Header + feed health + stats ════════════════════════ */}
      <div
        className="rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap"
        style={{
          background: "rgba(10,16,32,0.8)",
          border: "1px solid rgba(34,211,238,0.1)",
        }}
      >
        {/* Title + sync */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-slate-200 font-mono leading-none">
              System Overview
            </div>
            <div className="text-[8px] text-slate-600 mt-0.5 uppercase tracking-wider">
              Threat Telemetry · Real-time
            </div>
          </div>
          <button
            onClick={() => handleSync("otx")}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{
              background: syncing ? "rgba(34,211,238,0.05)" : "rgba(34,211,238,0.1)",
              border: "1px solid rgba(34,211,238,0.25)",
              color: "#22d3ee",
            }}
          >
            <RefreshCw className={`w-2.5 h-2.5 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-8 flex-shrink-0" style={{ background: "rgba(34,211,238,0.1)" }} />

        {/* Feed health inline strip */}
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {feeds.map((feed) => {
            const ok = feed.last_run_status === "success";
            const label = FEED_DISPLAY[feed.feed_name]?.label ?? feed.feed_name;
            return (
              <div
                key={feed.feed_name}
                className="flex items-center gap-1.5 px-2 py-1 rounded"
                style={{
                  background: ok ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${ok ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.2)"}`,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{
                    background: ok ? "#10b981" : "#ef4444",
                    boxShadow: ok ? "0 0 5px rgba(16,185,129,0.8)" : "0 0 5px rgba(239,68,68,0.6)",
                    animation: ok ? "livePulse 2s infinite" : undefined,
                  }}
                />
                <span className="text-[9px] font-mono font-semibold" style={{ color: ok ? "#6ee7b7" : "#fca5a5" }}>
                  {label}
                </span>
                <span className="text-[9px] tabular-nums font-mono text-slate-500">
                  {ok ? feed.total_iocs.toLocaleString() : "ERR"}
                </span>
                {ok && feed.last_iocs_new != null && feed.last_iocs_new > 0 && (
                  <span className="text-[8px] font-mono text-emerald-600">+{feed.last_iocs_new}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="w-px h-8 flex-shrink-0" style={{ background: "rgba(34,211,238,0.1)" }} />

        {/* Stats badges */}
        {stats && (
          <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            {[
              { label: "Total",    value: stats.total_iocs,                     color: "#22d3ee", icon: Database      },
              { label: "Critical", value: stats.iocs_by_severity.critical ?? 0, color: "#ef4444", icon: AlertTriangle },
              { label: "High",     value: stats.iocs_by_severity.high ?? 0,     color: "#f97316", icon: Zap           },
              { label: "Medium",   value: stats.iocs_by_severity.medium ?? 0,   color: "#f59e0b", icon: Shield        },
            ].map(({ label, value, color, icon: Icon }) => (
              <div
                key={label}
                className="flex items-center gap-1 px-2 py-1 rounded"
                style={{
                  background: `${color}0a`,
                  border: `1px solid ${color}25`,
                }}
              >
                <Icon className="w-2.5 h-2.5 flex-shrink-0" style={{ color }} />
                <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color: `${color}aa` }}>
                  {label}
                </span>
                <span className="text-[10px] font-bold font-mono tabular-nums" style={{ color }}>
                  {value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        <style>{`
          @keyframes livePulse {
            0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
            70%  { box-shadow: 0 0 0 4px rgba(16,185,129,0); }
            100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
          }
        `}</style>
      </div>

      {/* ═══ ROW 2 — Map (70%) + Live Alerts (30%) ═══════════════════════ */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,70%) minmax(0,30%)" }}>

        {/* Map panel */}
        <Panel>
          <PanelHeader
            icon={MapPin}
            title="Threat Origin Map"
            subtitle="Top-100 IP IOCs by severity · Mercator · Zoom with +/−"
            right={
              <span className="text-[9px] font-mono tabular-nums" style={{ color: "rgba(34,211,238,0.5)" }}>
                {geoPoints.length} IPs
              </span>
            }
          />
          <div className="flex-1 p-0">
            <GeoMap points={geoPoints} />
          </div>
        </Panel>

        {/* Live Alerts panel */}
        <Panel>
          <PanelHeader
            icon={Zap}
            title="Live Alerts"
            subtitle="High-severity indicators"
            right={
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#22c55e",
                    boxShadow: "0 0 6px rgba(34,197,94,0.9)",
                    animation: "livePulse 2s infinite",
                  }}
                />
                <Link
                  href="/search?severity_min=7"
                  className="text-[8px] uppercase tracking-wider font-mono flex items-center gap-0.5 transition-colors"
                  style={{ color: "rgba(34,211,238,0.5)" }}
                >
                  All <ArrowUpRight className="w-2.5 h-2.5" />
                </Link>
              </div>
            }
          />
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 420 }}>
            {recentIOCs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-slate-600">
                <Shield className="w-6 h-6 opacity-20" />
                No alerts
              </div>
            ) : (
              <div>
                {recentIOCs.map((ioc) => {
                  const truncated = ioc.value.length > 30 ? ioc.value.slice(0, 30) + "…" : ioc.value;
                  return (
                    <Link
                      key={ioc.id}
                      href={`/iocs/${ioc.id}`}
                      className="flex items-start gap-2 px-3 py-2 transition-colors group"
                      style={{ borderBottom: "1px solid rgba(34,211,238,0.05)" }}
                    >
                      <SevDot score={ioc.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <SevBadge score={ioc.severity} />
                          <span
                            className="text-[8px] uppercase tracking-wider font-mono px-1 py-0.5 rounded"
                            style={{ background: "rgba(34,211,238,0.07)", color: "#22d3ee80" }}
                          >
                            {ioc.type.replace("hash_", "")}
                          </span>
                        </div>
                        <div
                          className="font-mono text-[10px] truncate group-hover:underline"
                          style={{ color: "#67e8f9" }}
                          title={ioc.value}
                        >
                          {truncated}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[8px] font-mono text-slate-600">
                            {(ioc.severity ?? 0).toFixed(1)}
                          </span>
                          <span className="text-[8px] font-mono" style={{ color: "rgba(148,163,184,0.3)" }}>·</span>
                          <span className="text-[8px] font-mono text-slate-600">{formatRelativeTime(ioc.last_seen)}</span>
                        </div>
                      </div>
                      <ArrowUpRight className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400 mt-0.5" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {/* ═══ ROW 3 — Trend (33%) + Activity (33%) + Threat Actors (33%) ══ */}
      <div className="grid grid-cols-3 gap-2">

        {/* Trend chart */}
        <Panel>
          <PanelHeader
            icon={Activity}
            title="IOC Ingest"
            subtitle="Last 7 days"
            right={
              <div className="text-right">
                <div className="text-sm font-bold font-mono tabular-nums text-cyan-400 leading-none">
                  {trends.reduce((s, t) => s + t.count, 0).toLocaleString()}
                </div>
                <div className="text-[8px] uppercase tracking-wider text-slate-600 mt-0.5">this week</div>
              </div>
            }
          />
          <div className="flex-1 px-2 pt-2 pb-1" style={{ minHeight: 160 }}>
            <TrendChart trends={trends} />
          </div>
        </Panel>

        {/* Latest Activity */}
        <Panel>
          <PanelHeader
            icon={Radio}
            title="Latest Activity"
            subtitle="IOC ingestion events"
          />
          <div className="flex-1 overflow-y-auto" style={{ maxHeight: 200 }}>
            {activity.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-slate-600">
                No activity yet.
              </div>
            ) : (
              <div>
                {activity.map((ev, i) => {
                  const sev = getSeverity(ev.severity);
                  const truncated = ev.ioc_value.length > 28 ? ev.ioc_value.slice(0, 28) + "…" : ev.ioc_value;
                  return (
                    <Link
                      key={i}
                      href={`/iocs/${ev.ioc_id}`}
                      className="flex items-center gap-2 px-3 py-1.5 transition-colors group"
                      style={{ borderBottom: "1px solid rgba(34,211,238,0.04)" }}
                    >
                      <SevDot score={ev.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className={`text-[7px] uppercase font-bold tracking-wider ${sev.textCls}`}>
                            {sev.label}
                          </span>
                          <span className="text-[7px] text-slate-600">{ev.ioc_type}</span>
                          <span className="text-[7px] text-slate-700">· {ev.feed_name}</span>
                        </div>
                        <div className="font-mono text-[9px] truncate group-hover:underline text-cyan-300/80">
                          {truncated}
                        </div>
                      </div>
                      <span className="text-[8px] font-mono text-slate-700 flex-shrink-0">
                        {formatRelativeTime(ev.ingested_at)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>

        {/* Top Threat Actors */}
        <Panel>
          <PanelHeader
            icon={Users}
            title="Top Threat Actors"
            subtitle="By linked IOC count"
            right={
              <Link
                href="/threat-actors"
                className="text-[8px] uppercase tracking-wider font-mono flex items-center gap-0.5 transition-colors"
                style={{ color: "rgba(34,211,238,0.5)" }}
              >
                All <ArrowUpRight className="w-2.5 h-2.5" />
              </Link>
            }
          />
          <div className="flex-1 px-3 py-2 space-y-2.5" style={{ maxHeight: 200, overflowY: "auto" }}>
            {threatActors.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-xs text-slate-600">
                No threat actors found.
              </div>
            ) : (
              threatActors.map((actor, i) => {
                const pct = Math.max(4, (actor.linked_ioc_count / maxActorCount) * 100);
                const barColor =
                  i === 0 ? "#ef4444" :
                  i === 1 ? "#f97316" :
                  i === 2 ? "#f59e0b" :
                             "#22d3ee";
                return (
                  <Link key={actor.id} href={`/threat-actors/${actor.id}`} className="block group">
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0"
                          style={{ background: `${barColor}15`, color: barColor, border: `1px solid ${barColor}30` }}
                        >
                          {actor.mitre_id}
                        </span>
                        <span
                          className="text-[10px] font-bold font-mono truncate group-hover:underline"
                          style={{ color: "#cbd5e1" }}
                        >
                          {actor.name}
                        </span>
                      </div>
                      <span
                        className="text-[10px] font-mono font-bold tabular-nums flex-shrink-0 ml-2"
                        style={{ color: barColor }}
                      >
                        {actor.linked_ioc_count.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 6px ${barColor}60` }}
                      />
                    </div>
                    {actor.country && (
                      <div className="text-[8px] text-slate-700 mt-0.5 font-mono">{actor.country}</div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </Panel>
      </div>

    </div>
  );
}
