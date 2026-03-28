"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/api.client";
import {
  Network, ArrowUpRight, Shield, Zap, Activity,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Campaign {
  id: string;
  name: string;
  confidence: number | null;
  ioc_count: number;
  status: string;
  primary_signal: string | null;
  first_seen: string | null;
  last_seen: string | null;
  techniques: Array<{ id: string }>;
  threat_actor_ids: string[];
  created_at: string;
}

interface CampaignStats {
  total_campaigns: number;
  total_clustered_iocs: number;
  avg_confidence: number | null;
  by_signal_type: Record<string, number>;
  active_campaigns: number;
  archived_campaigns: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */
const SIGNAL_LABELS: Record<string, string> = {
  subnet_clustering:  "Subnet",
  cooccurrence:       "Co-occur",
  malware_family:     "Malware",
  temporal_clustering:"Temporal",
  ttp_overlap:        "TTP",
};

const SIGNAL_COLORS: Record<string, string> = {
  subnet_clustering:  "#22d3ee",
  cooccurrence:       "#a78bfa",
  malware_family:     "#f97316",
  temporal_clustering:"#f59e0b",
  ttp_overlap:        "#ef4444",
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

const ALL_SIGNALS = ["subnet_clustering","cooccurrence","malware_family","temporal_clustering","ttp_overlap"];

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [activeSignal, setActiveSignal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (signal?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page_size: "50", status: "active" });
      if (signal) params.set("signal_type", signal);
      const [campRes, statsRes] = await Promise.all([
        fetchApi(`/api/campaigns?${params}`),
        fetchApi("/api/campaigns/stats").catch(() => null),
      ]);
      setCampaigns(campRes?.items ?? []);
      setStats(statsRes ?? null);
    } catch {
      setError("Could not reach the backend.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSignalFilter = (sig: string | null) => {
    setActiveSignal(sig);
    load(sig);
  };

  const triggerRun = async () => {
    setTriggering(true);
    try {
      await fetchApi("/api/campaigns/run", { method: "POST" });
    } catch { /* ignore */ }
    setTimeout(() => setTriggering(false), 3000);
  };

  return (
    <div className="space-y-3 animate-in fade-in duration-400">

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        className="rounded-lg px-4 py-3 relative overflow-hidden"
        style={{ background: "rgba(8,13,28,0.9)", border: "1px solid rgba(34,211,238,0.12)" }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundSize: "28px 28px", opacity: 0.3 }} />
        <div className="relative z-10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Network className="w-4 h-4 text-cyan-400" style={{ filter: "drop-shadow(0 0 6px rgba(34,211,238,0.6))" }} />
              <h1 className="text-sm font-bold uppercase tracking-widest font-mono" style={{ color: "#e2e8f0", textShadow: "0 0 10px rgba(34,211,238,0.3)" }}>
                CAMPAIGNS
              </h1>
            </div>
            <p className="text-[10px] uppercase tracking-wider text-slate-600 font-mono">
              Correlation Intelligence · IOC Clustering Engine
            </p>
          </div>
          <button
            onClick={triggerRun}
            disabled={triggering}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all disabled:opacity-50 flex-shrink-0"
            style={{
              background: triggering ? "rgba(34,211,238,0.04)" : "rgba(34,211,238,0.08)",
              border: "1px solid rgba(34,211,238,0.22)",
              color: "#22d3ee",
            }}
          >
            <Activity className={`w-3 h-3 ${triggering ? "animate-pulse" : ""}`} />
            {triggering ? "Running…" : "Run Engine"}
          </button>
        </div>
      </div>

      {/* ─── Stats bar ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Total Campaigns", value: stats?.total_campaigns ?? 0, color: "#a78bfa", icon: Network },
          { label: "IOCs Clustered",  value: stats?.total_clustered_iocs ?? 0, color: "#22d3ee", icon: Shield },
          { label: "Avg Confidence",  value: stats?.avg_confidence != null ? `${(stats.avg_confidence * 100).toFixed(0)}%` : "—", color: "#f97316", icon: Zap, raw: true },
          { label: "Active",          value: stats?.active_campaigns ?? 0, color: "#10b981", icon: Activity },
        ].map(({ label, value, color, icon: Icon, raw }) => (
          <div
            key={label}
            className="rounded-lg px-3 py-2.5 flex items-center gap-2.5"
            style={{ background: "rgba(8,13,28,0.8)", border: `1px solid ${color}20` }}
          >
            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0" style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
              <Icon className="w-3.5 h-3.5" style={{ color }} />
            </div>
            <div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wider font-mono">{label}</div>
              <div className="text-sm font-bold font-mono tabular-nums leading-tight" style={{ color, textShadow: `0 0 8px ${color}50` }}>
                {raw ? value : Number(value).toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Filter pills ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[8px] uppercase tracking-widest text-slate-700 font-mono mr-1">Filter:</span>
        {[null, ...ALL_SIGNALS].map((sig) => {
          const active = sig === activeSignal;
          const color = sig ? SIGNAL_COLORS[sig] : "#22d3ee";
          const label = sig ? (SIGNAL_LABELS[sig] ?? sig) : "All";
          return (
            <button
              key={sig ?? "all"}
              onClick={() => handleSignalFilter(sig)}
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all font-mono"
              style={{
                background: active ? `${color}18` : "rgba(34,211,238,0.03)",
                border: `1px solid ${active ? color : "rgba(34,211,238,0.1)"}`,
                color: active ? color : "#475569",
                boxShadow: active ? `0 0 8px ${color}25` : "none",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── Campaign grid ────────────────────────────────────────────────── */}
      {error ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3">
          <span className="text-xs text-red-400">{error}</span>
          <button
            onClick={() => load(activeSignal)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] uppercase tracking-wider font-mono"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.2)", color: "#22d3ee" }}
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : campaigns.length === 0 ? (
        <div
          className="rounded-lg flex flex-col items-center justify-center gap-3 py-16"
          style={{ background: "rgba(8,13,28,0.6)", border: "1px solid rgba(34,211,238,0.08)" }}
        >
          <Network className="w-8 h-8 text-slate-800" />
          <p className="text-xs text-slate-700 font-mono uppercase tracking-wider">
            {activeSignal ? "No campaigns match this signal filter" : "No campaigns yet — engine runs every 6 hours"}
          </p>
          <button
            onClick={triggerRun}
            className="text-[9px] uppercase tracking-wider font-mono px-3 py-1.5 rounded"
            style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.15)", color: "#22d3ee" }}
          >
            Run Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {campaigns.map((c) => {
            const conf = c.confidence ?? 0;
            const cc = confColor(c.confidence);
            const sigColor = c.primary_signal ? (SIGNAL_COLORS[c.primary_signal] ?? "#64748b") : "#64748b";
            return (
              <Link
                key={c.id}
                href={`/campaigns/${c.id}`}
                className="group rounded-lg p-3.5 flex flex-col gap-2.5 transition-all"
                style={{
                  background: "rgba(8,13,28,0.8)",
                  border: "1px solid rgba(34,211,238,0.09)",
                  boxShadow: "0 0 0 transparent",
                }}
              >
                {/* Name */}
                <div className="font-mono text-[11px] font-bold text-slate-300 group-hover:text-cyan-300 leading-tight" title={c.name}>
                  {c.name}
                </div>

                {/* Confidence bar */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${conf * 100}%`, background: cc, boxShadow: `0 0 5px ${cc}` }}
                    />
                  </div>
                  <span className="text-[9px] font-mono tabular-nums font-bold flex-shrink-0" style={{ color: cc }}>
                    {(conf * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Badges row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-[8px] font-mono px-1.5 py-0.5 rounded font-bold"
                    style={{ background: "rgba(34,211,238,0.07)", color: "rgba(34,211,238,0.65)", border: "1px solid rgba(34,211,238,0.12)" }}
                  >
                    {c.ioc_count} IOCs
                  </span>
                  {c.primary_signal && (
                    <span
                      className="text-[8px] font-mono px-1.5 py-0.5 rounded"
                      style={{ background: `${sigColor}10`, color: sigColor, border: `1px solid ${sigColor}25` }}
                    >
                      {SIGNAL_LABELS[c.primary_signal] ?? c.primary_signal}
                    </span>
                  )}
                  {c.techniques.length > 0 && (
                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(239,68,68,0.08)", color: "rgba(239,68,68,0.65)", border: "1px solid rgba(239,68,68,0.15)" }}>
                      {c.techniques.length} TTP{c.techniques.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Timeline */}
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-mono text-slate-700">{fmt(c.first_seen)}</span>
                  <div className="flex-1 mx-2 h-px" style={{ background: "linear-gradient(to right, rgba(34,211,238,0.1), rgba(34,211,238,0.3), rgba(34,211,238,0.1))" }} />
                  <span className="text-[8px] font-mono text-slate-700">{fmt(c.last_seen)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-mono text-slate-800">
                    {c.threat_actor_ids.length > 0 ? `${c.threat_actor_ids.length} actor${c.threat_actor_ids.length !== 1 ? "s" : ""}` : "No linked actors"}
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-slate-800 group-hover:text-cyan-400 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
