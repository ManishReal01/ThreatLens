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

const FEED_SHORT: Record<string, string> = {
  abuseipdb: "AIPDB",
  urlhaus:   "UHAUS",
  otx:       "OTX",
};

function AlertItem({ alert, isNew }: AlertItemProps) {
  const sev = getSeverity(alert.severity);
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b last:border-b-0 transition-all duration-500"
      style={{
        borderColor: "var(--border)",
        opacity: isNew ? 0 : 1,
        transform: isNew ? "translateY(-8px)" : "translateY(0)",
        animation: isNew ? "slideIn 0.4s ease forwards" : undefined,
      }}
    >
      <span
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-semibold flex-shrink-0 ${sev.cls}`}
      >
        <span className={`w-1 h-1 rounded-full ${sev.dotCls}`} />
        {sev.label}
      </span>
      <span
        className="font-mono text-[10px] truncate flex-1 min-w-0"
        style={{ color: "var(--foreground)" }}
        title={alert.value}
      >
        {alert.value.length > 28 ? alert.value.slice(0, 28) + "…" : alert.value}
      </span>
      <span
        className="text-[9px] font-mono flex-shrink-0"
        style={{ color: "var(--muted-foreground)" }}
      >
        {formatRelativeTime(alert.first_seen)}
      </span>
    </div>
  );
}

export default function AlertTicker() {
  const [alerts, setAlerts] = useState<IOCAlert[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const [pulse, setPulse] = useState(true);

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
      setPulse((p) => !p); // toggle to trigger visual pulse
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
      className="flex flex-col rounded-lg border overflow-hidden"
      style={{
        width: 300,
        background: "var(--card)",
        borderColor: "var(--border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: "#22c55e",
            boxShadow: "0 0 0 0 rgba(34,197,94,0.6)",
            animation: "livePulse 2s infinite",
          }}
        />
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "#4ade80" }}
        >
          Live
        </span>
        <span
          className="text-[10px] flex-1"
          style={{ color: "var(--muted-foreground)" }}
        >
          High-severity alerts
        </span>
        <span
          className="text-[9px] font-mono"
          style={{ color: "var(--muted-foreground)" }}
        >
          30s
        </span>
      </div>

      {/* Alert list */}
      <div className="overflow-hidden">
        {alerts.length === 0 ? (
          <div
            className="px-3 py-4 text-[10px] text-center"
            style={{ color: "var(--muted-foreground)" }}
          >
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
