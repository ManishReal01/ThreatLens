"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TrendPoint {
  date: string;  // YYYY-MM-DD
  count: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-2.5 py-2 rounded border text-xs"
      style={{
        background: "var(--card)",
        borderColor: "var(--border)",
        color: "var(--foreground)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      <div className="font-mono font-medium" style={{ color: "var(--primary)" }}>
        {payload[0].value.toLocaleString()} IOCs
      </div>
      <div style={{ color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

function shortDate(iso: string): string {
  // "2026-03-15" → "Mar 15"
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function TrendChart({ trends }: { trends: TrendPoint[] }) {
  const data = trends.map((t) => ({ date: shortDate(t.date), count: t.count }));

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-28 text-xs"
        style={{ color: "var(--muted-foreground)" }}
      >
        No data for the last 7 days.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor="#22d3ee" stopOpacity={0.45} />
            <stop offset="60%" stopColor="#22d3ee" stopOpacity={0.1} />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(148,163,184,0.1)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 9, fill: "var(--muted-foreground)", fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(56,189,248,0.3)", strokeWidth: 1 }} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#22d3ee"
          strokeWidth={2}
          fill="url(#trendGrad)"
          dot={false}
          activeDot={{ r: 3, fill: "#22d3ee", stroke: "#06b6d4", strokeWidth: 1 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
