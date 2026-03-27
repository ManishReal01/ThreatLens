"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface GeoIPPoint {
  value: string;
  latitude: number;
  longitude: number;
  severity: number | null;
  feed_source: string;
  country?: string | null;
}

interface TooltipState {
  x: number;
  y: number;
  point: GeoIPPoint;
}

function dotColor(severity: number | null): string {
  if (severity === null || severity === undefined) return "#94a3b8";
  if (severity >= 8.0) return "#ef4444";
  if (severity >= 6.5) return "#f97316";
  if (severity >= 4.0) return "#f59e0b";
  return "#3b82f6";
}

function dotRadius(severity: number | null, zoom: number): number {
  const base =
    severity === null || severity === undefined ? 2 :
    severity >= 8.0 ? 3.5 :
    severity >= 6.5 ? 2.8 :
    severity >= 4.0 ? 2.2 :
    1.8;
  return base / Math.sqrt(zoom);
}

function severityLabel(severity: number | null): string {
  if (severity === null || severity === undefined) return "Unknown";
  if (severity >= 8.0) return "Critical";
  if (severity >= 6.5) return "High";
  if (severity >= 4.0) return "Medium";
  return "Low";
}

const FEED_LABELS: Record<string, string> = {
  abuseipdb:    "AbuseIPDB",
  urlhaus:      "URLhaus",
  otx:          "AlienVault OTX",
  threatfox:    "ThreatFox",
  feodotracker: "Feodo Tracker",
};

export default function GeoMap({ points }: { points: GeoIPPoint[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [zoom, setZoom] = useState(1.0);

  const BASE_SCALE = 145;
  const scale = BASE_SCALE * zoom;

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 260, color: "#475569" }}
      >
        No geolocated IP indicators available.
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ background: "#070d18", borderRadius: "0 0 0.375rem 0.375rem", overflow: "hidden" }}>
      <style>{`
        @keyframes geoip-critical-pulse {
          0%   { r: 0;  opacity: 0.7; }
          75%  { r: 14; opacity: 0;   }
          100% { r: 14; opacity: 0;   }
        }
        @keyframes geoip-radar-sweep {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .geoip-critical-ring   { animation: geoip-critical-pulse 2.4s ease-out infinite; }
        .geoip-critical-ring-2 { animation: geoip-critical-pulse 2.4s ease-out 1.2s infinite; }
      `}</style>

      {/* ── Zoom controls ─────────────────────────────────────────────────── */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-0.5">
        {[
          { label: "+", title: "Zoom in",  onClick: () => setZoom((z) => Math.min(z * 1.4, 8)) },
          { label: "−", title: "Zoom out", onClick: () => setZoom((z) => Math.max(z / 1.4, 0.5)) },
        ].map(({ label, title, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            title={title}
            className="w-6 h-6 flex items-center justify-center text-xs font-bold rounded transition-colors"
            style={{
              background: "rgba(7,13,24,0.9)",
              border: "1px solid rgba(34,211,238,0.2)",
              color: "#22d3ee",
              cursor: "pointer",
              boxShadow: "0 0 6px rgba(34,211,238,0.1)",
            }}
          >
            {label}
          </button>
        ))}
        {zoom !== 1.0 && (
          <button
            onClick={() => setZoom(1.0)}
            title="Reset zoom"
            className="w-6 h-6 flex items-center justify-center rounded"
            style={{
              background: "rgba(7,13,24,0.9)",
              border: "1px solid rgba(34,211,238,0.1)",
              color: "#64748b",
              cursor: "pointer",
              fontSize: 8,
            }}
          >
            ⊙
          </button>
        )}
      </div>

      {/* ── Map SVG ──────────────────────────────────────────────────────── */}
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale, center: [10, 20] }}
        style={{ width: "100%", height: "auto", background: "#070d18", display: "block" }}
      >
        <defs>
          <filter id="geoip-glow-crit" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="geoip-glow-high" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="geoip-glow-med" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="1.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* Radar sweep gradient */}
          <radialGradient id="radar-beam" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="85%" stopColor="#22d3ee" stopOpacity="0" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.04" />
          </radialGradient>
        </defs>

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#0b1628"
                stroke="rgba(34,211,238,0.07)"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover:   { outline: "none", fill: "#0f1e36" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {points.map((pt, i) => {
          const color = dotColor(pt.severity);
          const r = dotRadius(pt.severity, zoom);
          const isCrit = pt.severity !== null && pt.severity >= 8.0;
          const isHigh = pt.severity !== null && pt.severity >= 6.5 && !isCrit;
          const filterId = isCrit ? "geoip-glow-crit" : isHigh ? "geoip-glow-high" : "geoip-glow-med";

          return (
            <Marker
              key={i}
              coordinates={[pt.longitude, pt.latitude]}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: pt });
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {isCrit && (
                <>
                  <circle className="geoip-critical-ring"   fill="none" stroke={color} strokeWidth={0.7} strokeOpacity={0.5} style={{ pointerEvents: "none" }} />
                  <circle className="geoip-critical-ring-2" fill="none" stroke={color} strokeWidth={0.5} strokeOpacity={0.35} style={{ pointerEvents: "none" }} />
                </>
              )}
              <circle
                r={r}
                fill={color}
                fillOpacity={0.92}
                filter={`url(#${filterId})`}
                stroke={color}
                strokeWidth={0.3}
                strokeOpacity={0.5}
                style={{ cursor: "pointer" }}
              />
            </Marker>
          );
        })}
      </ComposableMap>

      {/* ── Radar sweep overlay ──────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "conic-gradient(from 0deg, transparent 330deg, rgba(34,211,238,0.04) 355deg, rgba(34,211,238,0.07) 360deg)",
          animation: "geoip-radar-sweep 8s linear infinite",
          transformOrigin: "center center",
          mixBlendMode: "screen",
        }}
      />

      {/* ── Dark vignette ─────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(7,13,24,0.7) 80%, rgba(7,13,24,0.95) 100%)",
        }}
      />

      {/* ── Tooltip ──────────────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none px-3 py-2 rounded-md text-xs"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 14,
            background: "rgba(2,6,23,0.97)",
            border: "1px solid rgba(34,211,238,0.2)",
            color: "#e2e8f0",
            maxWidth: 230,
            boxShadow: "0 6px 24px rgba(0,0,0,0.8), 0 0 12px rgba(34,211,238,0.05)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className="font-mono font-semibold text-cyan-400 truncate mb-1" style={{ textShadow: "0 0 8px rgba(34,211,238,0.4)" }}>
            {tooltip.point.value}
          </div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dotColor(tooltip.point.severity), boxShadow: `0 0 5px ${dotColor(tooltip.point.severity)}` }}
            />
            <span style={{ color: dotColor(tooltip.point.severity), fontWeight: 600 }}>
              {severityLabel(tooltip.point.severity)}
            </span>
            {tooltip.point.severity !== null && (
              <span className="text-slate-600">&nbsp;{tooltip.point.severity.toFixed(1)}</span>
            )}
          </div>
          {tooltip.point.country && <div className="text-slate-500 text-[11px]">{tooltip.point.country}</div>}
          <div className="text-slate-700 text-[11px] mt-0.5">
            {FEED_LABELS[tooltip.point.feed_source] ?? tooltip.point.feed_source}
          </div>
        </div>
      )}

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 flex-wrap"
        style={{ borderTop: "1px solid rgba(34,211,238,0.07)", background: "rgba(7,13,24,0.6)" }}
      >
        {[
          { label: "Critical", color: "#ef4444" },
          { label: "High",     color: "#f97316" },
          { label: "Medium",   color: "#f59e0b" },
          { label: "Low",      color: "#3b82f6" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: `0 0 5px ${color}80` }}
            />
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: `${color}bb` }}>
              {label}
            </span>
          </div>
        ))}
        <div className="text-[9px] font-mono ml-auto tabular-nums" style={{ color: "rgba(34,211,238,0.3)" }}>
          {points.length} IP{points.length !== 1 ? "s" : ""} plotted
        </div>
      </div>
    </div>
  );
}
