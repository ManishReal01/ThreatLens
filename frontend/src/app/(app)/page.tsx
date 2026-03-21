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
const TYPE_COLORS: Record<string, string> = {
  ipv4:        "bg-sky-500/10 text-sky-400 border-sky-500/20",
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

/* ─── Severity badge ────────────────────────────────────────────────────── */
function SevBadge({ score }: { score: number | null | undefined }) {
  const sev = getSeverity(score);
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold border ${sev.cls}`}>
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
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-lg border text-sm"
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.25)", color: "#f87171" }}
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  /* ── Loading skeleton ────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-400">

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--foreground)" }}>
            System Overview
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Real-time ingest pipeline &amp; threat telemetry
          </p>
          <button
            onClick={() => handleSync("otx")}
            disabled={syncing}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-50"
            style={{
              background: "rgba(56,189,248,0.10)",
              border: "1px solid rgba(56,189,248,0.25)",
              color: "var(--primary)",
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            Trigger Sync
          </button>
        </div>

        {/* Live alert ticker */}
        <div className="flex-shrink-0">
          <AlertTicker />
        </div>
      </div>

      {/* ── Feed health cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {feeds.length === 0 ? (
          <div
            className="col-span-3 flex items-center justify-center h-24 rounded-lg border text-xs"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
          >
            No feed data available.
          </div>
        ) : (
          feeds.map((feed) => {
            const ok = feed.last_run_status === "success";
            const display = FEED_DISPLAY[feed.feed_name] ?? { label: feed.feed_name, short: feed.feed_name.toUpperCase() };
            return (
              <div
                key={feed.feed_name}
                className="rounded-lg border border-slate-700/50 p-4 space-y-3 relative overflow-hidden"
                style={{
                  background: ok ? "var(--card)" : "rgba(239,68,68,0.04)",
                  borderColor: ok ? "var(--border)" : "rgba(239,68,68,0.25)",
                }}
              >
                {/* subtle grid bg */}
                <div className="absolute inset-0 bg-grid-ops opacity-30 pointer-events-none" />

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${ok ? "bg-[#22c55e] status-pulse" : "bg-[#ef4444]"}`}
                    />
                    <span className="text-xs font-semibold font-heading uppercase tracking-wider" style={{ color: "var(--foreground)" }}>
                      {display.label}
                    </span>
                  </div>
                  {ok ? (
                    <Activity className="w-3.5 h-3.5" style={{ color: "#4ade80" }} />
                  ) : (
                    <ServerCrash className="w-3.5 h-3.5" style={{ color: "#f87171" }} />
                  )}
                </div>

                <div className="relative">
                  <div
                    className="text-2xl font-bold font-heading tabular-nums"
                    style={{ color: ok ? "var(--foreground)" : "#f87171" }}
                  >
                    {ok ? feed.total_iocs.toLocaleString() : "Error"}
                  </div>
                  <div className="text-[10px] mt-0.5 space-y-0.5" style={{ color: "var(--muted-foreground)" }}>
                    <div className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatRelativeTime(feed.last_run_at)}
                      {feed.last_iocs_fetched != null && ok && (
                        <span className="ml-1">· +{(feed.last_iocs_new ?? 0).toLocaleString()} new</span>
                      )}
                    </div>
                    {feed.last_error_msg && (
                      <div className="truncate text-[#f87171]" title={feed.last_error_msg}>
                        {feed.last_error_msg}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Stats strip ───────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total IOCs", value: stats.total_iocs,                        icon: Database,      color: "var(--primary)", bg: "rgba(56,189,248,0.08)"  },
            { label: "Critical",   value: stats.iocs_by_severity.critical ?? 0,    icon: AlertTriangle, color: "#f87171",        bg: "rgba(239,68,68,0.08)"   },
            { label: "High",       value: stats.iocs_by_severity.high ?? 0,        icon: Zap,           color: "#fb923c",        bg: "rgba(249,115,22,0.08)"  },
            { label: "Medium",     value: stats.iocs_by_severity.medium ?? 0,      icon: Shield,        color: "#4ade80",        bg: "rgba(34,197,94,0.08)"   },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div
              key={label}
              className="rounded-lg border border-slate-700/50 p-3 flex items-center gap-3"
              style={{ background: bg, borderColor: `${color}30` }}
            >
              <div
                className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                style={{ background: `${color}15`, border: `1px solid ${color}30` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div>
                <div className="text-xl font-bold font-heading tabular-nums leading-none" style={{ color: "var(--foreground)" }}>
                  {value.toLocaleString()}
                </div>
                <div className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── IOC ingest trend chart ────────────────────────────────────── */}
      <div
        className="rounded-lg border border-slate-700/50 overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
              IOC Ingest — Last 7 Days
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Daily new indicators across all feeds
            </p>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold font-heading tabular-nums" style={{ color: "var(--primary)" }}>
              {trends.reduce((s, t) => s + t.count, 0).toLocaleString()}
            </div>
            <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--muted-foreground)" }}>
              total this week
            </div>
          </div>
        </div>
        <div className="px-4 pt-3 pb-2">
          <TrendChart trends={trends} />
        </div>
      </div>

      {/* ── GeoIP threat map ──────────────────────────────────────────── */}
      <div
        className="rounded-lg border border-slate-700/50 overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-semibold font-heading flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <MapPin className="w-3.5 h-3.5" style={{ color: "var(--primary)" }} />
              Threat Origin Map
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Top-100 IP IOCs by severity · coordinates cached via ip-api.com
            </p>
          </div>
        </div>
        <div className="p-4">
          <GeoMap points={geoPoints} />
        </div>
      </div>

      {/* ── Latest Activity feed ──────────────────────────────────────── */}
      <div
        className="rounded-lg border border-slate-700/50 overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-semibold font-heading flex items-center gap-2" style={{ color: "var(--foreground)" }}>
              <Radio className="w-3.5 h-3.5" style={{ color: "var(--primary)" }} />
              Latest Activity
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              10 most recent IOC ingestion events across all feeds
            </p>
          </div>
        </div>
        {activity.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs" style={{ color: "var(--muted-foreground)" }}>
            No activity yet.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {activity.map((ev, i) => {
              const sev = getSeverity(ev.severity);
              const truncated = ev.ioc_value.length > 40 ? ev.ioc_value.slice(0, 40) + "…" : ev.ioc_value;
              const when = formatRelativeTime(ev.ingested_at);
              return (
                <Link
                  key={i}
                  href={`/iocs/${ev.ioc_id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors group"
                  style={{ display: "flex" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(56,189,248,0.04)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                >
                  {/* Severity dot */}
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sev.dotCls}`} />
                  {/* Message */}
                  <span className="flex-1 text-xs min-w-0">
                    <span style={{ color: "var(--muted-foreground)" }}>New </span>
                    <span className={`font-semibold uppercase tracking-wide text-[10px] ${sev.textCls}`}>
                      {sev.label}
                    </span>
                    <span style={{ color: "var(--muted-foreground)" }}> {ev.ioc_type} </span>
                    <span className="font-mono" style={{ color: "var(--primary)" }}>{truncated}</span>
                    <span style={{ color: "var(--muted-foreground)" }}> from </span>
                    <span className="font-medium" style={{ color: "var(--foreground)" }}>{ev.feed_name}</span>
                  </span>
                  {/* Time */}
                  <span className="text-[10px] flex-shrink-0 font-mono" style={{ color: "var(--muted-foreground)" }}>
                    {when}
                  </span>
                  <ArrowUpRight className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--primary)" }} />
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent high-severity IOCs table ───────────────────────────── */}
      <div
        className="rounded-lg border border-slate-700/50 overflow-hidden"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <h2 className="text-sm font-semibold font-heading" style={{ color: "var(--foreground)" }}>
              Recent High-Severity Indicators
            </h2>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
              Severity ≥ 7.0 · sorted by score
            </p>
          </div>
          <Link
            href="/search?severity_min=7"
            className="flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded transition-colors"
            style={{ color: "var(--primary)", border: "1px solid rgba(56,189,248,0.2)" }}
          >
            View All <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

        {recentIOCs.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-36 gap-2 text-xs"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Shield className="w-8 h-8 opacity-20" />
            No high-severity IOCs found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-700" style={{ borderBottom: `1px solid var(--border)` }}>
                  {["Indicator", "Type", "Score", "Severity", "Sources", "Last Seen"].map((h) => (
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
                {recentIOCs.map((ioc, i) => {
                  const sev = getSeverity(ioc.severity);
                  return (
                    <tr
                      key={ioc.id}
                      className="group cursor-pointer transition-colors border-b border-slate-800/50"
                      style={{
                        borderBottom: i < recentIOCs.length - 1 ? `1px solid var(--border)` : undefined,
                      }}
                      onClick={() => (window.location.href = `/iocs/${ioc.id}`)}
                    >
                      {/* Indicator */}
                      <td className="px-4 py-2.5">
                        <span
                          className="font-mono text-xs font-medium group-hover:underline truncate max-w-[240px] block"
                          style={{ color: "var(--primary)", fontFamily: "var(--font-mono)" }}
                        >
                          {ioc.value}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-2.5">
                        <TypeBadge type={ioc.type} />
                      </td>

                      {/* Score bar */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-14 h-1.5 rounded-full overflow-hidden flex-shrink-0"
                            style={{ background: "var(--muted)" }}
                          >
                            <div
                              className={`h-full rounded-full ${sev.barCls}`}
                              style={{ width: `${((ioc.severity ?? 0) / 10) * 100}%` }}
                            />
                          </div>
                          <span
                            className="tabular-nums font-mono text-[11px]"
                            style={{ color: "var(--foreground)" }}
                          >
                            {(ioc.severity ?? 0).toFixed(1)}
                          </span>
                        </div>
                      </td>

                      {/* Severity */}
                      <td className="px-4 py-2.5">
                        <SevBadge score={ioc.severity} />
                      </td>

                      {/* Sources */}
                      <td className="px-4 py-2.5 tabular-nums" style={{ color: "var(--muted-foreground)" }}>
                        {ioc.source_count}
                      </td>

                      {/* Last seen */}
                      <td className="px-4 py-2.5 font-mono" style={{ color: "var(--muted-foreground)" }}>
                        {formatDateTime(ioc.last_seen)}
                      </td>
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
