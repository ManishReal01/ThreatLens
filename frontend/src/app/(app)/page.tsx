"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatRelativeTime } from "@/lib/utils";
import {
  Activity, RefreshCw, Zap, Shield, Database,
  AlertTriangle, ArrowUpRight, MapPin, Radio, Users, Network,
} from "lucide-react";
import Link from "next/link";

const GeoMap = dynamic(() => import("@/components/GeoMap"), {
  ssr: false,
  loading: () => (
    <div
      className="flex flex-col items-center justify-center gap-2"
      style={{ height: 264, background: "#070d18" }}
    >
      <MapPin className="w-5 h-5 text-slate-800" />
      <span className="text-[10px] font-mono uppercase tracking-widest text-slate-700">
        Loading threat map…
      </span>
    </div>
  ),
});
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

interface Campaign {
  id: string;
  name: string;
  confidence: number | null;
  ioc_count: number;
  primary_signal: string | null;
  first_seen: string | null;
  last_seen: string | null;
}

interface CampaignStats {
  total_campaigns: number;
  total_clustered_iocs: number;
  avg_confidence: number | null;
}

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─── Feed display map ───────────────────────────────────────────────────── */
const FEED_DISPLAY: Record<string, { label: string }> = {
  urlhaus:      { label: "URLhaus" },
  otx:          { label: "OTX" },
  threatfox:    { label: "ThreatFox" },
  cisa_kev:     { label: "CISA" },
  mitre_attack: { label: "MITRE" },
  virustotal:   { label: "VirusTotal" },
  feodotracker: { label: "Feodo" },
  malwarebazaar:{ label: "MBazaar" },
  sslbl:        { label: "SSLBL" },
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
      className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
      style={{ background: color, boxShadow: `0 0 5px ${color}` }}
    />
  );
}

/* ─── Severity badge ─────────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  const styles: Record<string, { bg: string; border: string; color: string; glow: string }> = {
    Critical: { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  color: "#fca5a5", glow: "0 0 6px rgba(239,68,68,0.4)" },
    High:     { bg: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.35)", color: "#fdba74", glow: "0 0 6px rgba(249,115,22,0.4)" },
    Medium:   { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", color: "#fcd34d", glow: "0 0 4px rgba(245,158,11,0.3)" },
    Low:      { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.35)", color: "#93c5fd", glow: "none" },
  };
  const s = styles[sev.label] ?? { bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.3)", color: "#94a3b8", glow: "none" };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold leading-none"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, boxShadow: s.glow }}
    >
      {sev.label}
    </span>
  );
}

/* ─── Panel wrapper ──────────────────────────────────────────────────────── */
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`panel-card rounded-lg overflow-hidden flex flex-col ${className}`}
      style={{
        background: "rgba(8,13,28,0.8)",
        border: "1px solid rgba(34,211,238,0.1)",
        backdropFilter: "blur(8px)",
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
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2 flex-shrink-0"
      style={{
        borderBottom: "1px solid rgba(34,211,238,0.07)",
        background: "rgba(34,211,238,0.015)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <Icon
            className="w-3 h-3 flex-shrink-0"
            style={{ color: "#22d3ee", filter: "drop-shadow(0 0 4px rgba(34,211,238,0.5))" }}
          />
        )}
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-300 font-mono leading-none">
            {title}
          </div>
          {subtitle && <div className="text-[8px] text-slate-700 mt-0.5">{subtitle}</div>}
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
  const [deferredLoading, setDeferredLoading] = useState(true);
  const [mapLoading, setMapLoading] = useState(true);
  const [feeds, setFeeds] = useState<FeedHealth[]>([]);
  const [recentIOCs, setRecentIOCs] = useState<IOCListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [geoPoints, setGeoPoints] = useState<GeoIPPoint[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [threatActors, setThreatActors] = useState<ThreatActor[]>([]);
  const [topCampaigns, setTopCampaigns] = useState<Campaign[]>([]);
  const [campaignStats, setCampaignStats] = useState<CampaignStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [feedsStale, setFeedsStale] = useState(false);
  const [recentStale, setRecentStale] = useState(false);

  // Animated stat counters
  const [displayStats, setDisplayStats] = useState({ total: 0, critical: 0, high: 0, medium: 0 });

  useEffect(() => {
    if (!stats) return;
    const targets = {
      total:    stats.total_iocs,
      critical: stats.iocs_by_severity?.critical ?? 0,
      high:     stats.iocs_by_severity?.high ?? 0,
      medium:   stats.iocs_by_severity?.medium ?? 0,
    };
    let step = 0;
    const STEPS = 45;
    const id = setInterval(() => {
      step++;
      const t = Math.min(step / STEPS, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplayStats({
        total:    Math.round(targets.total * ease),
        critical: Math.round(targets.critical * ease),
        high:     Math.round(targets.high * ease),
        medium:   Math.round(targets.medium * ease),
      });
      if (step >= STEPS) clearInterval(id);
    }, 1200 / STEPS);
    return () => clearInterval(id);
  }, [stats]);

  useEffect(() => {
    async function init() {
      // Each call fails independently — only /api/stats failing shows the full error state.
      const [feedRes, recentRes, statsRes] = await Promise.all([
        fetchApi("/api/feeds/health").catch(() => null),
        fetchApi("/api/iocs?page_size=10&severity_min=5.0&sort_by=last_seen").catch(() => null),
        fetchApi("/api/stats").catch(() => null),
      ]);

      if (statsRes === null) {
        setError("Could not reach the backend. Ensure the API is running at the configured backend URL");
      }
      setFeeds(feedRes?.feeds ?? []);
      setFeedsStale(feedRes === null);
      setRecentIOCs(recentRes?.items ?? []);
      setRecentStale(recentRes === null);
      setStats(statsRes ?? null);
      setLoading(false);

      // Phase 2a — map: fetch 50 IPs first so the map renders fast,
      // then silently expand to 200 in the background.
      fetchApi("/api/stats/geoip?limit=50")
        .catch(() => [])
        .then((geo50) => {
          setGeoPoints(Array.isArray(geo50) ? geo50 : []);
          setMapLoading(false);
          // Background expand — no await, no loading indicator
          fetchApi("/api/stats/geoip?limit=200")
            .catch(() => [])
            .then((geo200) => {
              if (Array.isArray(geo200) && geo200.length > 0) setGeoPoints(geo200);
            });
        });

      // Phase 2b — other panels: independent of map
      Promise.all([
        fetchApi("/api/stats/trends").catch(() => ({ trends: [] })),
        fetchApi("/api/stats/activity").catch(() => ({ events: [] })),
        fetchApi("/api/threat-actors?page_size=5").catch(() => ({ items: [] })),
        fetchApi("/api/campaigns?page_size=3&status=active").catch(() => ({ items: [] })),
        fetchApi("/api/campaigns/stats").catch(() => null),
      ]).then(([trendsRes, activityRes, actorsRes, campaignsRes, campStatsRes]) => {
        setTrends(trendsRes?.trends ?? []);
        setActivity(activityRes?.events ?? []);
        setThreatActors(actorsRes?.items ?? []);
        setTopCampaigns(campaignsRes?.items ?? []);
        setCampaignStats(campStatsRes ?? null);
      }).finally(() => setDeferredLoading(false));
    }
    init();
  }, [retryCount]);

  const criticalCount = useMemo(() => stats?.iocs_by_severity?.critical ?? 0, [stats]);
  const maxActorCount = useMemo(() => Math.max(...threatActors.map((a) => a.linked_ioc_count), 1), [threatActors]);

  const handleSync = async (feedName: string) => {
    setSyncing(true);
    try {
      await fetchApi(`/api/feeds/${feedName}/trigger`, { method: "POST" });
    } catch { /* ignore */ }
    setTimeout(() => setSyncing(false), 2000);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="flex items-center gap-3 px-5 py-4 rounded-lg border text-sm" style={{ background: "rgba(239,68,68,0.06)", borderColor: "rgba(239,68,68,0.25)", color: "#fca5a5" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
        <button
          onClick={() => { setError(null); setLoading(true); setRetryCount(n => n + 1); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-mono transition-all"
          style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", color: "#22d3ee" }}
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

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

  return (
    <div className="space-y-2 animate-in fade-in duration-400">

      {/* ═══ ROW 1 — Command bar ════════════════════════════════════════════ */}
      <div
        className="rounded-lg px-3 py-2 flex items-center gap-3 flex-wrap relative overflow-hidden"
        style={{
          background: "rgba(8,13,28,0.9)",
          border: "1px solid rgba(34,211,238,0.12)",
        }}
      >
        {/* Subtle grid bg */}
        <div className="absolute inset-0 bg-grid-ops pointer-events-none" style={{ backgroundSize: "28px 28px", opacity: 0.4 }} />

        {/* Title + sync */}
        <div className="relative z-10 flex items-center gap-3 flex-shrink-0">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest font-mono leading-none" style={{ color: "#e2e8f0", textShadow: "0 0 10px rgba(34,211,238,0.3)" }}>
              System Overview
            </div>
            <div className="text-[8px] text-slate-600 mt-0.5 uppercase tracking-wider font-mono">
              Threat Telemetry · Real-time
            </div>
          </div>
          <button
            onClick={() => handleSync("otx")}
            disabled={syncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
            style={{
              background: syncing ? "rgba(34,211,238,0.04)" : "rgba(34,211,238,0.08)",
              border: "1px solid rgba(34,211,238,0.22)",
              color: "#22d3ee",
              boxShadow: syncing ? "none" : "0 0 8px rgba(34,211,238,0.08)",
            }}
          >
            <RefreshCw className={`w-2.5 h-2.5 ${syncing ? "animate-spin" : ""}`} />
            Sync
          </button>
        </div>

        {/* Divider */}
        <div className="relative z-10 w-px h-8 flex-shrink-0" style={{ background: "rgba(34,211,238,0.1)" }} />

        {/* Feed health rail — grouped: Intel Feeds | Enrichment */}
        <div className="relative z-10 flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          {[
            {
              groupLabel: "INTEL",
              names: ["urlhaus","otx","threatfox","cisa_kev","feodotracker","malwarebazaar","sslbl"],
            },
            {
              groupLabel: "ENRICH",
              names: ["mitre_attack","virustotal","geoip_enricher"],
            },
          ].map(({ groupLabel, names }) => {
            const groupFeeds = names
              .map((n) => feeds.find((f) => f.feed_name === n))
              .filter(Boolean) as FeedHealth[];
            if (groupFeeds.length === 0) {
              if (!feedsStale) return null;
              return (
                <span key={groupLabel} className="text-[8px] font-mono" style={{ color: "rgba(245,158,11,0.6)" }}>
                  ⚠ {groupLabel} updating…
                </span>
              );
            }
            return (
              <div key={groupLabel} className="flex items-center gap-1 min-w-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
                <span className="text-[7px] uppercase tracking-[0.15em] text-slate-700 font-mono flex-shrink-0 pr-1" style={{ borderRight: "1px solid rgba(34,211,238,0.08)" }}>
                  {groupLabel}
                </span>
                {groupFeeds.map((feed) => {
                  const ok = feed.last_run_status === "success";
                  const running = feed.last_run_status === "running";
                  // Warn (amber) when feed has data but last run errored — not a full failure.
                  const warn = !ok && !running && feed.total_iocs > 0;
                  const label = FEED_DISPLAY[feed.feed_name]?.label ?? feed.feed_name;
                  const dotColor = ok ? "#10b981" : (running || warn) ? "#f59e0b" : "#ef4444";
                  const textColor = ok ? "#6ee7b7" : (running || warn) ? "#fcd34d" : "#fca5a5";
                  const countLabel =
                    feed.feed_name === "mitre_attack"    ? `${(feed.last_iocs_fetched ?? 0).toLocaleString()}` :
                    feed.feed_name === "virustotal"      ? `${(feed.last_iocs_fetched ?? 0).toLocaleString()}` :
                    feed.feed_name === "geoip_enricher"  ? `${(feed.last_iocs_fetched ?? 0).toLocaleString()} IPs` :
                    feed.total_iocs > 0 ? feed.total_iocs.toLocaleString() :
                    "ERR";
                  return (
                    <div
                      key={feed.feed_name}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        background: ok ? "rgba(16,185,129,0.04)" : (running || warn) ? "rgba(245,158,11,0.04)" : "rgba(239,68,68,0.05)",
                        border: `1px solid ${ok ? "rgba(16,185,129,0.14)" : (running || warn) ? "rgba(245,158,11,0.2)" : "rgba(239,68,68,0.2)"}`,
                      }}
                      title={feed.last_error_msg ?? `Last run: ${feed.last_run_at ?? "never"}`}
                    >
                      <span
                        className="w-1 h-1 rounded-full flex-shrink-0"
                        style={{
                          background: dotColor,
                          boxShadow: `0 0 4px ${dotColor}`,
                          animation: ok ? "status-pulse-ring 2s ease-out infinite" : undefined,
                        }}
                      />
                      <span className="text-[8px] font-mono font-medium" style={{ color: textColor }}>
                        {label}
                      </span>
                      <span className="text-[8px] tabular-nums font-mono text-slate-700">
                        {countLabel}
                      </span>
                      {ok && feed.last_iocs_new != null && feed.last_iocs_new > 0 && (
                        <span className="text-[7px] font-mono" style={{ color: "#34d399" }}>+{feed.last_iocs_new}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="relative z-10 w-px h-8 flex-shrink-0" style={{ background: "rgba(34,211,238,0.1)" }} />

        {/* Stats counters */}
        {stats && (
          <div className="relative z-10 flex items-center gap-1.5 flex-shrink-0 flex-wrap">
            {[
              { label: "Total",     value: displayStats.total,    color: "#22d3ee", icon: Database,      animation: undefined },
              { label: "Critical",  value: displayStats.critical, color: "#ef4444", icon: AlertTriangle, animation: criticalCount > 0 ? "crit-pulse 1.6s ease-in-out infinite" : undefined },
              { label: "High",      value: displayStats.high,     color: "#f97316", icon: Zap,           animation: undefined },
              { label: "Medium",    value: displayStats.medium,   color: "#f59e0b", icon: Shield,        animation: undefined },
              { label: "Campaigns", value: campaignStats?.total_campaigns ?? 0, color: "#a78bfa", icon: Network, animation: undefined },
            ].map(({ label, value, color, icon: Icon, animation }) => (
              <div
                key={label}
                className="flex items-center gap-1 px-2 py-1 rounded"
                style={{
                  background: `${color}08`,
                  border: `1px solid ${color}22`,
                  animation,
                }}
              >
                <Icon className="w-2.5 h-2.5 flex-shrink-0" style={{ color }} />
                <span className="text-[9px] uppercase tracking-wider font-mono" style={{ color: `${color}88` }}>
                  {label}
                </span>
                <span
                  className="text-[11px] font-bold font-mono tabular-nums"
                  style={{ color, textShadow: `0 0 8px ${color}60` }}
                >
                  {value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ ROW 2 — Map (70%) + Live Alerts (30%) ══════════════════════════ */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "minmax(0,70%) minmax(0,30%)", alignItems: "stretch" }}>

        {/* Map panel */}
        <Panel>
          <PanelHeader
            icon={MapPin}
            title="Threat Origin Map"
            subtitle="Top-200 IP IOCs by severity · Zoom with +/−"
            right={
              <span className="text-[9px] font-mono tabular-nums" style={{ color: "rgba(34,211,238,0.45)" }}>
                {mapLoading ? "…" : `${geoPoints.length} IPs`}
              </span>
            }
          />
          <div className="flex-1 p-0">
            {mapLoading
              ? (
                <div
                  className="flex flex-col items-center justify-center gap-2 m-2 rounded"
                  style={{ height: 264, background: "rgba(7,13,24,0.6)", border: "1px solid rgba(34,211,238,0.06)" }}
                >
                  <MapPin className="w-5 h-5 text-slate-800" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-700">
                    Loading threat map…
                  </span>
                </div>
              )
              : <GeoMap points={geoPoints} />
            }
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
                {recentStale && (
                  <span className="text-[8px] font-mono" style={{ color: "rgba(245,158,11,0.6)" }}>⚠ updating…</span>
                )}
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#22c55e",
                    boxShadow: "0 0 8px rgba(34,197,94,1)",
                    animation: "status-pulse-ring 2s ease-out infinite",
                  }}
                />
                <Link
                  href="/search?severity_min=6.5"
                  className="text-[8px] uppercase tracking-wider font-mono flex items-center gap-0.5 transition-colors"
                  style={{ color: "rgba(34,211,238,0.45)" }}
                >
                  All <ArrowUpRight className="w-2.5 h-2.5" />
                </Link>
              </div>
            }
          />
          <div className="soc-scroll flex-1 min-h-0 overflow-y-auto">
            {recentIOCs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-slate-700">
                <Shield className="w-6 h-6 opacity-20" />
                No alerts
              </div>
            ) : (
              <div>
                {recentIOCs.map((ioc, i) => {
                  const truncated = ioc.value.length > 30 ? ioc.value.slice(0, 30) + "…" : ioc.value;
                  return (
                    <Link
                      key={ioc.id}
                      href={`/iocs/${ioc.id}`}
                      className="flex items-start gap-2 px-3 py-2 transition-colors group"
                      style={{
                        borderBottom: "1px solid rgba(34,211,238,0.04)",
                        animation: `slide-in-left 0.25s ease-out ${i * 40}ms both`,
                      }}
                    >
                      <SevDot score={ioc.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <SevBadge score={ioc.severity} />
                          <span
                            className="text-[8px] uppercase tracking-wider font-mono px-1 py-0.5 rounded"
                            style={{ background: "rgba(34,211,238,0.06)", color: "rgba(34,211,238,0.5)" }}
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
                          <span className="text-[8px] font-mono text-slate-700">
                            {(ioc.severity ?? 0).toFixed(1)}
                          </span>
                          <span className="text-[8px] font-mono text-slate-800">·</span>
                          <span className="text-[8px] font-mono text-slate-700">{formatRelativeTime(ioc.last_seen)}</span>
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

      {/* ═══ ROW 3 — Trend (33%) + Activity (33%) + Threat Actors (33%) ════ */}
      <div className="grid grid-cols-3 gap-2">

        {/* Trend chart */}
        <Panel>
          <PanelHeader
            icon={Activity}
            title="IOC Ingest"
            subtitle="Last 7 days"
            right={
              <div className="text-right">
                <div className="text-sm font-bold font-mono tabular-nums leading-none" style={{ color: "#22d3ee", textShadow: "0 0 8px rgba(34,211,238,0.4)" }}>
                  {trends.reduce((s, t) => s + t.count, 0).toLocaleString()}
                </div>
                <div className="text-[8px] uppercase tracking-wider text-slate-700 mt-0.5">this week</div>
              </div>
            }
          />
          <div className="flex-1 px-2 pt-2 pb-1" style={{ minHeight: 160 }}>
            {deferredLoading
              ? <Skeleton className="h-32 rounded" />
              : <TrendChart trends={trends} />
            }
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
            {deferredLoading ? (
              <div className="px-3 py-2 space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
              </div>
            ) : activity.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-xs text-slate-700">
                No activity yet.
              </div>
            ) : (
              <div>
                {activity.map((ev, i) => {
                  const sev = getSeverity(ev.severity);
                  const truncated = ev.ioc_value.length > 28 ? ev.ioc_value.slice(0, 28) + "…" : ev.ioc_value;
                  const sevColor =
                    sev.label === "Critical" ? "#ef4444" :
                    sev.label === "High"     ? "#f97316" :
                    sev.label === "Medium"   ? "#f59e0b" :
                    sev.label === "Low"      ? "#3b82f6" : "#64748b";
                  return (
                    <Link
                      key={i}
                      href={`/iocs/${ev.ioc_id}`}
                      className="flex items-center gap-2 px-3 py-1.5 transition-colors group"
                      style={{
                        borderBottom: "1px solid rgba(34,211,238,0.04)",
                        animation: `slide-in-left 0.25s ease-out ${i * 30}ms both`,
                      }}
                    >
                      <SevDot score={ev.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[7px] uppercase font-bold tracking-wider" style={{ color: sevColor }}>
                            {sev.label}
                          </span>
                          <span className="text-[7px] text-slate-700">{ev.ioc_type}</span>
                          <span className="text-[7px] text-slate-800">· {ev.feed_name}</span>
                        </div>
                        <div className="font-mono text-[9px] truncate group-hover:underline" style={{ color: "#67e8f9" }}>
                          {truncated}
                        </div>
                      </div>
                      <span className="text-[8px] font-mono text-slate-800 flex-shrink-0">
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
                className="text-[8px] uppercase tracking-wider font-mono flex items-center gap-0.5"
                style={{ color: "rgba(34,211,238,0.45)" }}
              >
                All <ArrowUpRight className="w-2.5 h-2.5" />
              </Link>
            }
          />
          <div className="flex-1 px-3 py-2 space-y-2.5" style={{ maxHeight: 200, overflowY: "auto" }}>
            {deferredLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 rounded" />)}
              </div>
            ) : threatActors.length === 0 ? (
              <div className="flex items-center justify-center h-16 text-xs text-slate-700">
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
                  <Link
                    key={actor.id}
                    href={`/threat-actors/${actor.id}`}
                    className="block group"
                    style={{ animation: `slide-in-left 0.25s ease-out ${i * 50}ms both` }}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className="text-[8px] font-mono px-1 py-0.5 rounded flex-shrink-0"
                          style={{
                            background: `${barColor}12`,
                            color: barColor,
                            border: `1px solid ${barColor}28`,
                            boxShadow: `0 0 5px ${barColor}20`,
                          }}
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
                        style={{ color: barColor, textShadow: `0 0 6px ${barColor}60` }}
                      >
                        {actor.linked_ioc_count.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-0.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 6px ${barColor}60` }}
                      />
                    </div>
                    {actor.country && (
                      <div className="text-[8px] text-slate-800 mt-0.5 font-mono">{actor.country}</div>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </Panel>
      </div>

      {/* ═══ ROW 4 — Top Campaigns ═══════════════════════════════════════════ */}
      <Panel>
        <PanelHeader
          icon={Network}
          title="Top Campaigns"
          subtitle="Correlation clusters by IOC count"
          right={
            <Link href="/campaigns" className="text-[8px] uppercase tracking-wider font-mono flex items-center gap-0.5" style={{ color: "rgba(34,211,238,0.45)" }}>
              All <ArrowUpRight className="w-2.5 h-2.5" />
            </Link>
          }
        />
        <div className="px-3 py-2">
          {deferredLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}</div>
          ) : topCampaigns.length === 0 ? (
            <div className="flex items-center justify-center h-16 gap-2 text-xs text-slate-700">
              <Network className="w-4 h-4 opacity-20" />
              No campaigns yet — engine runs every 6h
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {topCampaigns.map((c) => {
                const conf = c.confidence ?? 0;
                const confColor = conf >= 0.75 ? "#ef4444" : conf >= 0.5 ? "#f97316" : "#f59e0b";
                const SIGNAL_LABELS: Record<string, string> = {
                  subnet_clustering: "Subnet", cooccurrence: "Co-occur",
                  malware_family: "Malware", temporal_clustering: "Temporal", ttp_overlap: "TTP",
                };
                return (
                  <Link key={c.id} href={`/campaigns/${c.id}`}
                    className="group p-2.5 rounded-lg transition-all"
                    style={{ background: "rgba(34,211,238,0.03)", border: "1px solid rgba(34,211,238,0.08)" }}
                  >
                    <div className="font-mono text-[10px] font-bold text-slate-300 truncate group-hover:text-cyan-300 mb-1.5" title={c.name}>{c.name}</div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full" style={{ width: `${conf * 100}%`, background: confColor, boxShadow: `0 0 4px ${confColor}` }} />
                      </div>
                      <span className="text-[9px] font-mono tabular-nums" style={{ color: confColor }}>{(conf * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "rgba(34,211,238,0.06)", color: "rgba(34,211,238,0.6)", border: "1px solid rgba(34,211,238,0.12)" }}>
                        {c.ioc_count} IOCs
                      </span>
                      {c.primary_signal && (
                        <span className="text-[8px] font-mono px-1 py-0.5 rounded" style={{ background: "rgba(167,139,250,0.08)", color: "rgba(167,139,250,0.7)", border: "1px solid rgba(167,139,250,0.15)" }}>
                          {SIGNAL_LABELS[c.primary_signal] ?? c.primary_signal}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </Panel>

    </div>
  );
}
