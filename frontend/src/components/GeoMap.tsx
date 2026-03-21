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
}

interface TooltipState {
  x: number;
  y: number;
  point: GeoIPPoint;
}

function dotColor(severity: number | null): string {
  if (severity === null || severity === undefined) return "#94a3b8";
  if (severity >= 8.5) return "#ef4444";
  if (severity >= 7) return "#fb923c";
  if (severity >= 4) return "#f59e0b";
  return "#3b82f6";
}

const FEED_LABELS: Record<string, string> = {
  abuseipdb: "AbuseIPDB",
  urlhaus: "URLhaus",
  otx: "AlienVault OTX",
};

export default function GeoMap({ points }: { points: GeoIPPoint[] }) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-xs" style={{ color: "var(--muted-foreground)" }}>
        No geolocated IP indicators available.
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ background: "transparent" }}>
      <ComposableMap
        projectionConfig={{ scale: 140 }}
        style={{ width: "100%", height: "auto" }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1e293b"
                stroke="#0f172a"
                strokeWidth={0.5}
                style={{
                  default: { outline: "none" },
                  hover: { outline: "none" },
                  pressed: { outline: "none" },
                }}
              />
            ))
          }
        </Geographies>

        {points.map((pt, i) => (
          <Marker
            key={i}
            coordinates={[pt.longitude, pt.latitude]}
            onMouseEnter={(e) => {
              const rect = (e.target as SVGElement)
                .closest("svg")
                ?.getBoundingClientRect();
              if (rect) {
                setTooltip({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  point: pt,
                });
              }
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <circle
              r={3.5}
              fill={dotColor(pt.severity)}
              fillOpacity={0.85}
              stroke={dotColor(pt.severity)}
              strokeWidth={0.5}
              strokeOpacity={0.4}
              style={{ cursor: "pointer" }}
            />
          </Marker>
        ))}
      </ComposableMap>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none px-2.5 py-2 rounded border text-xs space-y-0.5"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            background: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--foreground)",
            maxWidth: 220,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <div className="font-mono font-medium truncate" style={{ color: "var(--primary)" }}>
            {tooltip.point.value}
          </div>
          <div className="flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: dotColor(tooltip.point.severity) }}
            />
            <span>
              {tooltip.point.severity !== null
                ? tooltip.point.severity.toFixed(1)
                : "—"}
            </span>
            <span>·</span>
            <span>{FEED_LABELS[tooltip.point.feed_source] ?? tooltip.point.feed_source}</span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1 px-1 flex-wrap">
        {[
          { label: "Critical", color: "#ef4444" },
          { label: "High",     color: "#fb923c" },
          { label: "Medium",   color: "#f59e0b" },
        ].map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            {label}
          </div>
        ))}
        <div className="text-[10px] ml-auto tabular-nums" style={{ color: "var(--muted-foreground)" }}>
          {points.length} IP{points.length !== 1 ? "s" : ""} plotted
        </div>
      </div>
    </div>
  );
}
