"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatRelativeTime, formatDateTime } from "@/lib/utils";
import {
  Activity, ServerCrash, RefreshCw, Zap, Shield, Database,
  AlertTriangle, ArrowUpRight, Clock,
} from "lucide-react";
import Link from "next/link";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [feedRes, recentRes, statsRes] = await Promise.all([
          fetchApi("/api/feeds/health"),
          fetchApi("/api/iocs?page_size=8&severity_min=7"),
          fetchApi("/api/stats"),
        ]);

        setFeeds(feedRes?.feeds ?? []);
        setRecentIOCs(recentRes?.items ?? []);
        setStats(statsRes ?? null);
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
        <div>
          <h1 className="text-2xl font-bold font-heading tracking-tight" style={{ color: "var(--foreground)" }}>
            System Overview
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Real-time ingest pipeline &amp; threat telemetry
          </p>
        </div>
        <button
            onClick={() => handleSync("otx")}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium transition-all disabled:opacity-50"
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
