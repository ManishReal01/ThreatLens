"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatRelativeTime, formatDateTime } from "@/lib/utils";
import {
  Activity, ServerCrash, RefreshCw, Zap, Shield, Database,
  AlertTriangle, ArrowUpRight, Clock, MapPin, Radio,
} from "lucide-react";
import Link from "next/link";

const GeoMap = dynamic(() => import("@/components/GeoMap"), { ssr: false });
const AlertTicker = dynamic(() => import("@/components/AlertTicker"), { ssr: false });
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

/* ─── Skeleton ───────────────────────────────────────────────────────────── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

/* ─── Feed name display map ─────────────────────────────────────────────── */
const FEED_DISPLAY: Record<string, { label: string; short: string }> = {
  abuseipdb: { label: "AbuseIPDB", short: "AIPDB" },
  urlhaus: { label: "URLhaus", short: "UHAUS" },
  otx: { label: "AlienVault OTX", short: "OTX" },
};

/* ─── IOC type badge ─────────────────────────────────────────────────────── */
function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-wider bg-cyan-950/50 text-cyan-300 ring-1 ring-cyan-500/20">
      {type.replace("hash_", "")}
    </span>
  );
}

/* ─── Severity badge ────────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null | undefined }) {
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
      {sev.label}
    </span>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feeds, setFeeds] = useState<FeedHealth[]>([]);
  const [recentIOCs, setRecentIOCs] = useState<IOCListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [geoPoints, setGeoPoints] = useState<GeoIPPoint[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [feedRes, recentRes, statsRes, geoRes, trendsRes, activityRes] = await Promise.all([
          fetchApi("/api/feeds/health"),
          fetchApi("/api/iocs?page_size=8&severity_min=7"),
          fetchApi("/api/stats"),
          fetchApi("/api/stats/geoip").catch(() => []),
          fetchApi("/api/stats/trends").catch(() => ({ trends: [] })),
          fetchApi("/api/stats/activity").catch(() => ({ events: [] })),
        ]);

        setFeeds(feedRes?.feeds ?? []);
        setRecentIOCs(recentRes?.items ?? []);
        setStats(statsRes ?? null);
        setGeoPoints(Array.isArray(geoRes) ? geoRes : []);
        setTrends(trendsRes?.trends ?? []);
        setActivity(activityRes?.events ?? []);
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

  /* ── Error state ─────────────────────────────────────────────────────── */
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

  /* ── Loading skeleton ────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-400">

      {/* ── Page header + alert ticker ─────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold font-heading tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">
            System Overview
          </h1>
          <p className="text-xs mt-0.5 text-slate-500">
            Real-time ingest pipeline &amp; threat telemetry
          </p>
          <button
            onClick={() => handleSync("otx")}
            disabled={syncing}
            className="mt-2.5 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all disabled:opacity-50 bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
            Trigger Sync
          </button>
        </div>
        <div className="flex-shrink-0">
          <AlertTicker />
        </div>
      </div>

      {/* ── Feed health row ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {feeds.length === 0 ? (
          <div className="col-span-3 flex items-center justify-center h-16 rounded-lg border border-slate-800 text-xs text-slate-500">
            No feed data available.
          </div>
        ) : (
          feeds.map((feed) => {
            const ok = feed.last_run_status === "success";
            const display = FEED_DISPLAY[feed.feed_name] ?? { label: feed.feed_name, short: feed.feed_name.toUpperCase() };
            return (
              <div
                key={feed.feed_name}
                className="bg-slate-900/40 backdrop-blur-sm rounded-lg border overflow-hidden relative"
                style={{ borderColor: ok ? "rgba(148,163,184,0.1)" : "rgba(239,68,68,0.2)" }}
              >
                <div className="absolute inset-0 bg-grid-ops opacity-20 pointer-events-none" />
                <div className="relative flex items-center gap-3 px-3 py-2.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-emerald-500 status-pulse" : "bg-red-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold font-heading uppercase tracking-wider text-slate-200">
                        {display.label}
                      </span>
                      <span className="text-sm font-bold font-heading tabular-nums text-slate-100">
                        {ok ? feed.total_iocs.toLocaleString() : <span className="text-red-400 text-xs">Error</span>}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-1 text-[9px] text-slate-500">
                        <Clock className="w-2.5 h-2.5" />
                        {formatRelativeTime(feed.last_run_at)}
                      </div>
                      {feed.last_iocs_fetched != null && ok && (
                        <span className="text-[9px] text-emerald-500">+{(feed.last_iocs_new ?? 0).toLocaleString()} new</span>
                      )}
                      {feed.last_error_msg && (
                        <span className="text-[9px] text-red-400 truncate" title={feed.last_error_msg}>{feed.last_error_msg}</span>
                      )}
                    </div>
                  </div>
                  {ok ? (
                    <Activity className="w-3.5 h-3.5 flex-shrink-0 text-emerald-500" />
                  ) : (
                    <ServerCrash className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Total IOCs", value: stats.total_iocs,                     icon: Database,      accent: "#22d3ee", bar: "bg-cyan-500"   },
            { label: "Critical",   value: stats.iocs_by_severity.critical ?? 0, icon: AlertTriangle, accent: "#f87171", bar: "bg-red-500"    },
            { label: "High",       value: stats.iocs_by_severity.high ?? 0,     icon: Zap,           accent: "#fb923c", bar: "bg-orange-500" },
            { label: "Medium",     value: stats.iocs_by_severity.medium ?? 0,   icon: Shield,        accent: "#fbbf24", bar: "bg-amber-500"  },
          ].map(({ label, value, icon: Icon, accent, bar }) => (
            <div
              key={label}
              className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 p-3 relative overflow-hidden"
            >
              <div
                className="absolute bottom-0 left-0 h-0.5 rounded-b-lg"
                style={{ width: "100%", background: `linear-gradient(to right, ${accent}60, transparent)` }}
              />
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[9px] uppercase tracking-widest text-slate-500">{label}</span>
                <Icon className="w-3 h-3 flex-shrink-0" style={{ color: accent }} />
              </div>
              <div className="text-xl font-bold font-heading tabular-nums text-slate-100">
                {value.toLocaleString()}
              </div>
              <div className="mt-1.5 h-0.5 rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${bar}`}
                  style={{ width: `${Math.min(100, (value / Math.max(stats.total_iocs, 1)) * 100)}%`, opacity: 0.7 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Trend chart + GeoMap side by side ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* IOC ingest trend */}
        <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
            <div>
              <h2 className="text-[11px] font-semibold font-heading text-slate-200">IOC Ingest — Last 7 Days</h2>
              <p className="text-[9px] mt-0.5 text-slate-500">Daily new indicators</p>
            </div>
            <div className="text-right">
              <div className="text-base font-bold font-heading tabular-nums text-cyan-400">
                {trends.reduce((s, t) => s + t.count, 0).toLocaleString()}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">this week</div>
            </div>
          </div>
          <div className="px-3 pt-2 pb-1.5">
            <TrendChart trends={trends} />
          </div>
        </div>

        {/* GeoIP map */}
        <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
            <div>
              <h2 className="text-[11px] font-semibold font-heading text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-3 h-3 text-cyan-400" />
                Threat Origin Map
              </h2>
              <p className="text-[9px] mt-0.5 text-slate-500">Top-100 IP IOCs by severity</p>
            </div>
          </div>
          <div className="p-3">
            <GeoMap points={geoPoints} />
          </div>
        </div>
      </div>

      {/* ── Latest Activity feed ───────────────────────────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
          <h2 className="text-[11px] font-semibold font-heading text-slate-200 flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-cyan-400" />
            Latest Activity
          </h2>
          <span className="text-[9px] text-slate-500">10 most recent IOC ingestion events</span>
        </div>
        {activity.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-slate-500">No activity yet.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {activity.map((ev, i) => {
              const sev = getSeverity(ev.severity);
              const truncated = ev.ioc_value.length > 45 ? ev.ioc_value.slice(0, 45) + "…" : ev.ioc_value;
              const when = formatRelativeTime(ev.ingested_at);
              return (
                <Link
                  key={i}
                  href={`/iocs/${ev.ioc_id}`}
                  className="flex items-center gap-3 px-4 py-2 transition-colors group hover:bg-cyan-950/30"
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dotCls}`} />
                  <span className="flex-1 text-[11px] min-w-0 text-slate-400">
                    <span className={`font-semibold uppercase tracking-wide text-[9px] mr-1 ${sev.textCls}`}>{sev.label}</span>
                    <span>{ev.ioc_type} </span>
                    <span className="font-mono text-cyan-300">{truncated}</span>
                    <span className="text-slate-500"> · {ev.feed_name}</span>
                  </span>
                  <span className="text-[9px] flex-shrink-0 font-mono text-slate-600">{when}</span>
                  <ArrowUpRight className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-cyan-400" />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent high-severity IOCs table ───────────────────────────── */}
      <div className="bg-slate-900/40 backdrop-blur-sm rounded-lg border border-slate-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
          <div>
            <h2 className="text-[11px] font-semibold font-heading text-slate-200">Recent High-Severity Indicators</h2>
            <p className="text-[9px] mt-0.5 text-slate-500">Severity ≥ 7.0 · sorted by score</p>
          </div>
          <Link
            href="/search?severity_min=7"
            className="flex items-center gap-1 text-[9px] uppercase tracking-wider px-2 py-1 rounded-md text-cyan-400 border border-cyan-800/40 hover:bg-cyan-950/30 transition-colors"
          >
            View All <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        {recentIOCs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-slate-500">
            <Shield className="w-8 h-8 opacity-20" />
            No high-severity IOCs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/60">
                  {["Indicator", "Type", "Score", "Severity", "Sources", "Last Seen"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-[9px] uppercase tracking-wider font-semibold text-slate-500">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentIOCs.map((ioc) => {
                  const sev = getSeverity(ioc.severity);
                  return (
                    <tr
                      key={ioc.id}
                      className="group cursor-pointer transition-colors hover:bg-cyan-950/30 border-b border-slate-800/40 last:border-b-0"
                      onClick={() => (window.location.href = `/iocs/${ioc.id}`)}
                    >
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs font-medium group-hover:underline truncate max-w-[240px] block text-cyan-300">
                          {ioc.value}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <TypeBadge type={ioc.type} />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1 rounded-full overflow-hidden bg-slate-800 flex-shrink-0">
                            <div className={`h-full rounded-full ${sev.barCls}`} style={{ width: `${((ioc.severity ?? 0) / 10) * 100}%` }} />
                          </div>
                          <span className="tabular-nums font-mono text-[11px] text-slate-300">{(ioc.severity ?? 0).toFixed(1)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <SevBadge score={ioc.severity} />
                      </td>
                      <td className="px-4 py-2 tabular-nums text-slate-500">{ioc.source_count}</td>
                      <td className="px-4 py-2 font-mono text-slate-500">{formatDateTime(ioc.last_seen)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
