"use client";

import { useEffect, useRef, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { getSeverity, formatRelativeTime } from "@/lib/utils";

interface IOCAlert {
  id: string;
  value: string;
  type: string;
  severity: number | null;
  first_seen: string;
  source_count: number;
}

interface AlertItemProps {
  alert: IOCAlert;
  isNew: boolean;
}

function AlertItem({ alert, isNew }: AlertItemProps) {
  const sev = getSeverity(alert.severity);
  const ringCls =
    sev.label === "Critical" ? "ring-red-500/30 bg-red-950/40 text-red-400" :
    sev.label === "High"     ? "ring-orange-500/30 bg-orange-950/40 text-orange-400" :
    sev.label === "Medium"   ? "ring-amber-500/30 bg-amber-950/40 text-amber-400" :
                               "ring-blue-500/30 bg-blue-950/40 text-blue-400";
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 transition-all duration-500"
      style={{
        borderColor: "rgba(34,211,238,0.07)",
        opacity: isNew ? 0 : 1,
        transform: isNew ? "translateY(-8px)" : "translateY(0)",
        animation: isNew ? "slideIn 0.4s ease forwards" : undefined,
      }}
    >
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wider font-semibold flex-shrink-0 ring-1 ${ringCls}`}>
        <span className={`w-1 h-1 rounded-full ${sev.dotCls}`} />
        {sev.label}
      </span>
      <span className="font-mono text-[10px] truncate flex-1 min-w-0 text-cyan-300" title={alert.value}>
        {alert.value.length > 28 ? alert.value.slice(0, 28) + "…" : alert.value}
      </span>
      <span className="text-[8px] font-mono flex-shrink-0 text-slate-600">
        {formatRelativeTime(alert.first_seen)}
      </span>
    </div>
  );
}

export default function AlertTicker() {
  const [alerts, setAlerts] = useState<IOCAlert[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());

  async function fetchAlerts() {
    try {
      const res = await fetchApi("/api/iocs?page_size=5&severity_min=7");
      const items: IOCAlert[] = res?.items ?? [];

      const freshIds = new Set<string>();
      items.forEach((a) => {
        if (!knownIds.current.has(a.id)) freshIds.add(a.id);
      });

      if (freshIds.size > 0) {
        setNewIds(freshIds);
        // Clear "new" highlight after animation completes
        setTimeout(() => setNewIds(new Set()), 600);
      }

      items.forEach((a) => knownIds.current.add(a.id));
      setAlerts(items);
    } catch {
      // Silently ignore — this is a non-critical ticker
    }
  }

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden"
      style={{
        width: 320,
        background: "rgba(15,23,42,0.8)",
        border: "1px solid rgba(34,211,238,0.15)",
        boxShadow: "0 0 20px rgba(34,211,238,0.05), inset 0 1px 0 rgba(34,211,238,0.1)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(34,211,238,0.1)" }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: "#22c55e",
            boxShadow: "0 0 8px rgba(34,197,94,0.8)",
            animation: "livePulse 2s infinite",
          }}
        />
        <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-400">Live</span>
        <span className="text-[9px] flex-1 text-slate-500 uppercase tracking-wider">High-severity alerts</span>
        <span className="text-[8px] font-mono text-slate-600 bg-slate-800/60 px-1.5 py-0.5 rounded">30s</span>
      </div>

      {/* Alert list */}
      <div className="overflow-hidden">
        {alerts.length === 0 ? (
          <div className="px-3 py-4 text-[9px] text-center text-slate-600">
            Waiting for alerts…
          </div>
        ) : (
          alerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              isNew={newIds.has(alert.id)}
            />
          ))
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes livePulse {
          0%   { box-shadow: 0 0 0 0 rgba(34,197,94,0.6); }
          70%  { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
      `}</style>
    </div>
  );
}
