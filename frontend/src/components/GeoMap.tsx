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
  if (severity >= 8.5) return "#ef4444";
  if (severity >= 7) return "#f97316";
  if (severity >= 4) return "#f59e0b";
  return "#3b82f6";
}

function dotRadius(severity: number | null): number {
  if (severity === null || severity === undefined) return 3;
  if (severity >= 8.5) return 5.5;
  if (severity >= 7) return 4.5;
  if (severity >= 4) return 3.5;
  return 3;
}

function severityLabel(severity: number | null): string {
  if (severity === null || severity === undefined) return "Unknown";
  if (severity >= 8.5) return "Critical";
  if (severity >= 7) return "High";
  if (severity >= 4) return "Medium";
  return "Low";
}

const FEED_LABELS: Record<string, string> = {
  abuseipdb: "AbuseIPDB",
  urlhaus: "URLhaus",
  otx: "AlienVault OTX",
  threatfox: "ThreatFox",
};

export default function GeoMap({ points }: { points: GeoIPPoint[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height: 260, color: "var(--muted-foreground)" }}
      >
        No geolocated IP indicators available.
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ background: "#070d18", borderRadius: "0.375rem", overflow: "hidden" }}>
      <style>{`
        @keyframes geoip-ring-pulse {
          0%   { opacity: 0.55; r: 0; }
          80%  { opacity: 0;    r: 14; }
          100% { opacity: 0;    r: 14; }
        }
        .geoip-ring {
          animation: geoip-ring-pulse 2.8s ease-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .geoip-ring-delay { animation-delay: 1.4s; }
      `}</style>

      <ComposableMap
        projectionConfig={{ scale: 148, center: [10, 8] }}
        style={{ width: "100%", height: "auto", background: "#070d18", display: "block" }}
      >
        <defs>
          <filter id="geoip-glow-red"   x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="geoip-glow-orange" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="geoip-glow-amber" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          <filter id="geoip-glow-blue"  x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#0f172a"
                stroke="rgba(34,211,238,0.10)"
                strokeWidth={0.4}
                style={{
                  default: { outline: "none" },
                  hover:   { outline: "none", fill: "#0f172a" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {points.map((pt, i) => {
          const color = dotColor(pt.severity);
          const r = dotRadius(pt.severity);
          const filterId =
            pt.severity !== null && pt.severity >= 8.5 ? "geoip-glow-red"
            : pt.severity !== null && pt.severity >= 7 ? "geoip-glow-orange"
            : pt.severity !== null && pt.severity >= 4 ? "geoip-glow-amber"
            : "geoip-glow-blue";

          return (
            <Marker
              key={i}
              coordinates={[pt.longitude, pt.latitude]}
              onMouseEnter={(e) => {
                const rect = (e.target as SVGElement)
                  .closest("svg")
                  ?.getBoundingClientRect();
                if (rect) {
                  setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, point: pt });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Pulse ring 1 */}
              <circle
                className="geoip-ring"
                fill="none"
                stroke={color}
                strokeWidth={0.8}
                strokeOpacity={0.6}
                style={{ pointerEvents: "none" }}
              />
              {/* Pulse ring 2 (offset) */}
              <circle
                className="geoip-ring geoip-ring-delay"
                fill="none"
                stroke={color}
                strokeWidth={0.8}
                strokeOpacity={0.4}
                style={{ pointerEvents: "none" }}
              />
              {/* Core dot */}
              <circle
                r={r}
                fill={color}
                fillOpacity={0.95}
                filter={`url(#${filterId})`}
                stroke={color}
                strokeWidth={0.4}
                strokeOpacity={0.5}
                style={{ cursor: "pointer" }}
              />
            </Marker>
          );
        })}
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none px-3 py-2 rounded-md text-xs"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 14,
            background: "rgba(2,6,23,0.96)",
            border: "1px solid rgba(34,211,238,0.18)",
            color: "#e2e8f0",
            maxWidth: 230,
            boxShadow: "0 6px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(34,211,238,0.05)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="font-mono font-semibold text-cyan-400 truncate mb-1">
            {tooltip.point.value}
          </div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{
                background: dotColor(tooltip.point.severity),
                boxShadow: `0 0 5px ${dotColor(tooltip.point.severity)}`,
              }}
            />
            <span style={{ color: dotColor(tooltip.point.severity), fontWeight: 600 }}>
              {severityLabel(tooltip.point.severity)}
            </span>
            {tooltip.point.severity !== null && (
              <span className="text-slate-500">
                &nbsp;{tooltip.point.severity.toFixed(1)}
              </span>
            )}
          </div>
          {tooltip.point.country && (
            <div className="text-slate-400 text-[11px]">{tooltip.point.country}</div>
          )}
          <div className="text-slate-500 text-[11px] mt-0.5">
            {FEED_LABELS[tooltip.point.feed_source] ?? tooltip.point.feed_source}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-2 flex-wrap border-t" style={{ borderColor: "rgba(34,211,238,0.08)" }}>
        {[
          { label: "Critical", color: "#ef4444" },
          { label: "High",     color: "#f97316" },
          { label: "Medium",   color: "#f59e0b" },
          { label: "Low",      color: "#3b82f6" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: color, boxShadow: `0 0 4px ${color}80` }}
            />
            {label}
          </div>
        ))}
        <div className="text-[10px] ml-auto tabular-nums text-slate-500">
          {points.length} IP{points.length !== 1 ? "s" : ""} plotted
        </div>
      </div>
    </div>
  );
}
