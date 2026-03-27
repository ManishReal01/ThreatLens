"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { ArrowLeft, Grid3X3, X, Users, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

/* ─── MITRE ATT&CK Enterprise data ─────────────────────────────────────── */
interface MitreTechnique { id: string; name: string }
interface MitreTactic    { id: string; name: string; short: string; techniques: MitreTechnique[] }

const TACTICS: MitreTactic[] = [
  {
    id: "TA0001", name: "Initial Access", short: "Initial Access",
    techniques: [
      { id: "T1078", name: "Valid Accounts" },
      { id: "T1190", name: "Exploit Public-Facing App" },
      { id: "T1133", name: "External Remote Services" },
      { id: "T1566", name: "Phishing" },
      { id: "T1189", name: "Drive-by Compromise" },
      { id: "T1195", name: "Supply Chain Compromise" },
      { id: "T1199", name: "Trusted Relationship" },
      { id: "T1200", name: "Hardware Additions" },
      { id: "T1091", name: "Removable Media" },
    ],
  },
  {
    id: "TA0002", name: "Execution", short: "Execution",
    techniques: [
      { id: "T1059", name: "Command & Scripting" },
      { id: "T1203", name: "Client Execution Exploit" },
      { id: "T1106", name: "Native API" },
      { id: "T1053", name: "Scheduled Task/Job" },
      { id: "T1047", name: "WMI" },
      { id: "T1204", name: "User Execution" },
      { id: "T1072", name: "Software Deployment Tools" },
      { id: "T1129", name: "Shared Modules" },
      { id: "T1569", name: "System Services" },
    ],
  },
  {
    id: "TA0003", name: "Persistence", short: "Persistence",
    techniques: [
      { id: "T1543", name: "Create/Modify System Process" },
      { id: "T1547", name: "Boot Autostart Execution" },
      { id: "T1136", name: "Create Account" },
      { id: "T1505", name: "Server Software Component" },
      { id: "T1098", name: "Account Manipulation" },
      { id: "T1197", name: "BITS Jobs" },
      { id: "T1176", name: "Browser Extensions" },
      { id: "T1554", name: "Compromise Client Binary" },
      { id: "T1546", name: "Event Triggered Execution" },
      { id: "T1574", name: "Hijack Execution Flow" },
    ],
  },
  {
    id: "TA0004", name: "Privilege Escalation", short: "Priv Esc",
    techniques: [
      { id: "T1548", name: "Abuse Elevation Control" },
      { id: "T1134", name: "Access Token Manipulation" },
      { id: "T1068", name: "Exploit Priv Escalation" },
      { id: "T1055", name: "Process Injection" },
      { id: "T1484", name: "Domain Policy Modification" },
      { id: "T1611", name: "Escape to Host" },
      { id: "T1053", name: "Scheduled Task/Job" },
    ],
  },
  {
    id: "TA0005", name: "Defense Evasion", short: "Def Evasion",
    techniques: [
      { id: "T1027", name: "Obfuscated Files" },
      { id: "T1562", name: "Impair Defenses" },
      { id: "T1070", name: "Indicator Removal" },
      { id: "T1036", name: "Masquerading" },
      { id: "T1112", name: "Modify Registry" },
      { id: "T1218", name: "System Binary Proxy Exec" },
      { id: "T1553", name: "Subvert Trust Controls" },
      { id: "T1055", name: "Process Injection" },
      { id: "T1497", name: "Sandbox Evasion" },
      { id: "T1620", name: "Reflective Code Loading" },
    ],
  },
  {
    id: "TA0006", name: "Credential Access", short: "Cred Access",
    techniques: [
      { id: "T1110", name: "Brute Force" },
      { id: "T1555", name: "Credentials from Stores" },
      { id: "T1003", name: "OS Credential Dumping" },
      { id: "T1056", name: "Input Capture" },
      { id: "T1557", name: "Adversary-in-the-Middle" },
      { id: "T1558", name: "Steal Kerberos Tickets" },
      { id: "T1539", name: "Steal Web Session Cookie" },
      { id: "T1552", name: "Unsecured Credentials" },
    ],
  },
  {
    id: "TA0007", name: "Discovery", short: "Discovery",
    techniques: [
      { id: "T1087", name: "Account Discovery" },
      { id: "T1082", name: "System Information Discovery" },
      { id: "T1083", name: "File & Directory Discovery" },
      { id: "T1069", name: "Permission Groups Discovery" },
      { id: "T1057", name: "Process Discovery" },
      { id: "T1018", name: "Remote System Discovery" },
      { id: "T1016", name: "Network Config Discovery" },
      { id: "T1049", name: "Network Connections Discovery" },
      { id: "T1033", name: "System Owner Discovery" },
    ],
  },
  {
    id: "TA0008", name: "Lateral Movement", short: "Lateral Mvmt",
    techniques: [
      { id: "T1210", name: "Exploitation Remote Services" },
      { id: "T1534", name: "Internal Spearphishing" },
      { id: "T1570", name: "Lateral Tool Transfer" },
      { id: "T1563", name: "Remote Session Hijacking" },
      { id: "T1021", name: "Remote Services" },
      { id: "T1091", name: "Removable Media" },
      { id: "T1072", name: "Software Deployment Tools" },
      { id: "T1080", name: "Taint Shared Content" },
    ],
  },
  {
    id: "TA0009", name: "Collection", short: "Collection",
    techniques: [
      { id: "T1560", name: "Archive Collected Data" },
      { id: "T1123", name: "Audio Capture" },
      { id: "T1119", name: "Automated Collection" },
      { id: "T1115", name: "Clipboard Data" },
      { id: "T1530", name: "Data from Cloud Storage" },
      { id: "T1213", name: "Data from Info Repositories" },
      { id: "T1005", name: "Data from Local System" },
      { id: "T1113", name: "Screen Capture" },
      { id: "T1125", name: "Video Capture" },
    ],
  },
  {
    id: "TA0011", name: "Command and Control", short: "C2",
    techniques: [
      { id: "T1071", name: "Application Layer Protocol" },
      { id: "T1132", name: "Data Encoding" },
      { id: "T1001", name: "Data Obfuscation" },
      { id: "T1568", name: "Dynamic Resolution" },
      { id: "T1573", name: "Encrypted Channel" },
      { id: "T1008", name: "Fallback Channels" },
      { id: "T1105", name: "Ingress Tool Transfer" },
      { id: "T1095", name: "Non-App Layer Protocol" },
      { id: "T1572", name: "Protocol Tunneling" },
      { id: "T1090", name: "Proxy" },
    ],
  },
  {
    id: "TA0010", name: "Exfiltration", short: "Exfiltration",
    techniques: [
      { id: "T1020", name: "Automated Exfiltration" },
      { id: "T1030", name: "Data Transfer Size Limits" },
      { id: "T1048", name: "Exfil Over Alt Protocol" },
      { id: "T1041", name: "Exfil Over C2 Channel" },
      { id: "T1011", name: "Exfil Over Other Medium" },
      { id: "T1052", name: "Exfil Over Physical Medium" },
      { id: "T1567", name: "Exfil Over Web Service" },
      { id: "T1029", name: "Scheduled Transfer" },
    ],
  },
  {
    id: "TA0040", name: "Impact", short: "Impact",
    techniques: [
      { id: "T1485", name: "Data Destruction" },
      { id: "T1486", name: "Data Encrypted for Impact" },
      { id: "T1565", name: "Data Manipulation" },
      { id: "T1491", name: "Defacement" },
      { id: "T1561", name: "Disk Wipe" },
      { id: "T1499", name: "Endpoint DoS" },
      { id: "T1495", name: "Firmware Corruption" },
      { id: "T1490", name: "Inhibit System Recovery" },
      { id: "T1498", name: "Network DoS" },
      { id: "T1496", name: "Resource Hijacking" },
      { id: "T1489", name: "Service Stop" },
    ],
  },
];

/* ─── Heatmap color levels ───────────────────────────────────────────────── */
// 5 distinct tiers — each ~2× brighter than the previous
const HEAT_TIERS = [
  { maxCount: 0,   bg: "#0d1117",                    glow: false },
  { maxCount: 2,   bg: "rgba(0,212,255,0.08)",       glow: false },
  { maxCount: 5,   bg: "rgba(0,212,255,0.20)",       glow: false },
  { maxCount: 20,  bg: "rgba(0,212,255,0.40)",       glow: false },
  { maxCount: Infinity, bg: "rgba(0,212,255,0.65)",  glow: true  },
] as const;

function getTier(count: number) {
  for (const tier of HEAT_TIERS) {
    if (count <= tier.maxCount) return tier;
  }
  return HEAT_TIERS[HEAT_TIERS.length - 1];
}

function cellStyle(count: number): React.CSSProperties {
  const tier = getTier(count);
  return {
    backgroundColor: tier.bg,
    ...(tier.glow ? { boxShadow: "inset 0 0 16px rgba(0,212,255,0.15), 0 0 10px rgba(0,212,255,0.12)" } : {}),
  };
}

function cellHoverStyle(count: number): React.CSSProperties {
  if (count === 0) return { backgroundColor: "rgba(0,212,255,0.04)", cursor: "default" };
  const tier = getTier(count);
  // Hover: bump opacity by ~+0.08
  const hoverBg = count <= 2  ? "rgba(0,212,255,0.16)"
                : count <= 5  ? "rgba(0,212,255,0.28)"
                : count <= 20 ? "rgba(0,212,255,0.50)"
                :               "rgba(0,212,255,0.75)";
  return {
    backgroundColor: hoverBg,
    cursor: "pointer",
    ...(tier.glow ? { boxShadow: "inset 0 0 20px rgba(0,212,255,0.2), 0 0 14px rgba(0,212,255,0.18)" } : {}),
  };
}

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Actor {
  id: string;
  mitre_id: string;
  name: string;
  techniques: { id: string; name: string }[];
}

/* ─── Technique modal ────────────────────────────────────────────────────── */
function TechniqueModal({
  technique,
  actors,
  onClose,
}: {
  technique: MitreTechnique;
  actors: Actor[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-xl overflow-hidden"
        style={{
          background: "rgba(8,14,28,0.98)",
          border: "1px solid rgba(34,211,238,0.3)",
          boxShadow: "0 0 40px rgba(34,211,238,0.08), 0 25px 50px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(34,211,238,0.08)" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-mono text-[10px] px-2 py-0.5 rounded"
                style={{ background: "rgba(34,211,238,0.07)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)" }}
              >
                {technique.id}
              </span>
              <a
                href={`https://attack.mitre.org/techniques/${technique.id}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-50 hover:opacity-100 transition-opacity"
                style={{ color: "#22d3ee" }}
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <h2 className="text-sm font-bold" style={{ fontFamily: "var(--font-heading)", color: "#f1f5f9" }}>
              {technique.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:text-cyan-300"
            style={{ color: "#334155" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <div className="text-[9px] uppercase tracking-widest mb-3 font-semibold" style={{ color: "#334155" }}>
            {actors.length} threat actor{actors.length !== 1 ? "s" : ""} use this technique
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {actors.map((a) => (
              <Link
                key={a.id}
                href={`/threat-actors/${a.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all"
                style={{ background: "rgba(12,20,38,0.7)", border: "1px solid rgba(34,211,238,0.06)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.28)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(12,20,38,0.95)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.06)";
                  (e.currentTarget as HTMLElement).style.background = "rgba(12,20,38,0.7)";
                }}
              >
                <span
                  className="font-mono text-[9px] px-1.5 py-0.5 rounded font-bold flex-shrink-0"
                  style={{ background: "rgba(34,211,238,0.07)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.18)" }}
                >
                  {a.mitre_id}
                </span>
                <span className="text-sm font-medium flex-1 truncate" style={{ color: "#e2e8f0" }}>
                  {a.name}
                </span>
                <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-30" style={{ color: "#22d3ee" }} />
              </Link>
            ))}
          </div>
          <a
            href={`https://attack.mitre.org/techniques/${technique.id}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs transition-all"
            style={{ borderColor: "rgba(34,211,238,0.12)", border: "1px solid rgba(34,211,238,0.12)", color: "#334155" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.32)";
              (e.currentTarget as HTMLElement).style.color = "#22d3ee";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(34,211,238,0.12)";
              (e.currentTarget as HTMLElement).style.color = "#334155";
            }}
          >
            <ExternalLink className="w-3 h-3" />
            View on MITRE ATT&amp;CK
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function AttackMatrixPage() {
  const [actors, setActors]   = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState<{ tech: MitreTechnique; actors: Actor[] } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        // Backend caps page_size at 100 — fetch all pages then detail-load each actor
        const first = await fetchApi("/api/threat-actors?page_size=100&page=1");
        const items: { id: string; mitre_id: string; name: string }[] = first?.items ?? [];
        const totalPages: number = first?.pages ?? 1;
        if (totalPages > 1) {
          const rest = await Promise.all(
            Array.from({ length: totalPages - 1 }, (_, i) =>
              fetchApi(`/api/threat-actors?page_size=100&page=${i + 2}`)
                .then((r) => r?.items ?? [])
                .catch(() => [])
            )
          );
          items.push(...rest.flat());
        }

        const detailed = await Promise.all(
          items.map((a) =>
            fetchApi(`/api/threat-actors/${a.id}`)
              .then((d) => ({ id: a.id, mitre_id: a.mitre_id, name: a.name, techniques: d.techniques ?? [] }))
              .catch(() => ({ id: a.id, mitre_id: a.mitre_id, name: a.name, techniques: [] }))
          )
        );
        setActors(detailed);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Build technique → actors map (normalize sub-technique IDs)
  const techActorMap = new Map<string, Actor[]>();
  for (const actor of actors) {
    for (const t of actor.techniques) {
      const base = t.id.split(".")[0];
      const existing = techActorMap.get(base) ?? [];
      if (!existing.find((a) => a.id === actor.id)) {
        techActorMap.set(base, [...existing, actor]);
      }
    }
  }

  const totalHighlighted = techActorMap.size;

  const handleCellClick = (tech: MitreTechnique) => {
    const actorsForTech = techActorMap.get(tech.id);
    if (actorsForTech && actorsForTech.length > 0) {
      setSelected({ tech, actors: actorsForTech });
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-400">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Link
          href="/threat-actors"
          className="inline-flex items-center gap-1.5 text-xs transition-colors hover:text-cyan-300"
          style={{ color: "#334155" }}
        >
          <ArrowLeft className="w-3 h-3" />
          Threat Actors
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-lg font-bold flex items-center gap-2"
            style={{ fontFamily: "var(--font-heading)", color: "#f1f5f9" }}
          >
            <Grid3X3 className="w-5 h-5" style={{ color: "#22d3ee" }} />
            MITRE ATT&amp;CK Matrix
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#334155" }}>
            Enterprise techniques — highlighted cells are used by tracked adversary groups
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs" style={{ color: "#334155" }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading actor data…
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", color: "#22d3ee" }}
            >
              <span className="w-2 h-2 rounded-sm" style={{ background: "rgba(34,211,238,0.5)" }} />
              {totalHighlighted} techniques observed
            </div>
            <div
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: "rgba(15,23,42,0.6)", border: "1px solid rgba(30,41,59,0.5)", color: "#334155" }}
            >
              <Users className="w-3 h-3" />
              {actors.length} actors
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ── Heatmap legend ──────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl"
        style={{ background: "rgba(8,14,28,0.7)", border: "1px solid rgba(34,211,238,0.07)" }}
      >
        <span className="text-[9px] uppercase tracking-widest font-mono mr-1" style={{ color: "#1e293b" }}>
          Density
        </span>

        {[
          { label: "0 actors",   bg: "#0d1117",                   text: "#1e293b", glow: false },
          { label: "1–2 actors", bg: "rgba(0,212,255,0.08)",      text: "#334155", glow: false },
          { label: "3–5 actors", bg: "rgba(0,212,255,0.20)",      text: "#64748b", glow: false },
          { label: "6–20 actors",bg: "rgba(0,212,255,0.40)",      text: "#22d3ee", glow: false },
          { label: "20+ actors", bg: "rgba(0,212,255,0.65)",      text: "#67e8f9", glow: true  },
        ].map(({ label, bg, text, glow }) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className="w-5 h-4 rounded flex-shrink-0"
              style={{
                backgroundColor: bg,
                border: "1px solid rgba(0,212,255,0.25)",
                boxShadow: glow ? "0 0 10px rgba(0,212,255,0.35)" : undefined,
              }}
            />
            <span className="text-[10px] font-mono" style={{ color: text }}>{label}</span>
          </div>
        ))}

        <span className="text-[9px] font-mono ml-auto" style={{ color: "#1e293b" }}>
          click lit cell → actor list
        </span>
      </div>

      {/* ── Matrix ──────────────────────────────────────────────────────── */}
      <div
        className="overflow-x-auto rounded-xl"
        style={{ border: "1px solid rgba(34,211,238,0.08)" }}
      >
        {/* minWidth: 12 tactics × 160px = 1920px */}
        <div style={{ minWidth: `${TACTICS.length * 160}px` }}>

          {/* ── Tactic headers — sticky top so they stay visible on scroll ── */}
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${TACTICS.length}, minmax(160px, 1fr))`,
              background: "rgba(6,11,22,0.99)",
              borderBottom: "2px solid rgba(34,211,238,0.18)",
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}
          >
            {TACTICS.map((tactic, i) => (
              <div
                key={tactic.id}
                className="px-3 py-3.5"
                style={{
                  borderRight: i < TACTICS.length - 1 ? "1px solid rgba(34,211,238,0.08)" : undefined,
                }}
              >
                <div className="text-[9px] font-mono font-bold mb-1" style={{ color: "#22d3ee", opacity: 0.7 }}>
                  {tactic.id}
                </div>
                <div
                  className="text-[12px] font-semibold leading-tight"
                  style={{ fontFamily: "var(--font-heading)", color: "#e2e8f0" }}
                >
                  {tactic.short}
                </div>
                <div className="text-[9px] mt-1 font-mono" style={{ color: "#1e293b" }}>
                  {tactic.techniques.length} techniques
                </div>
              </div>
            ))}
          </div>

          {/* ── Technique rows ────────────────────────────────────────────── */}
          {(() => {
            const maxRows = Math.max(...TACTICS.map((t) => t.techniques.length));
            return Array.from({ length: maxRows }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="grid"
                style={{ gridTemplateColumns: `repeat(${TACTICS.length}, minmax(160px, 1fr))` }}
              >
                {TACTICS.map((tactic, colIdx) => {
                  const tech = tactic.techniques[rowIdx];
                  if (!tech) {
                    return (
                      <div
                        key={`${tactic.id}-empty-${rowIdx}`}
                        style={{
                          backgroundColor: "#0d1117",
                          borderRight: colIdx < TACTICS.length - 1 ? "1px solid rgba(15,25,44,0.5)" : undefined,
                          borderBottom: "1px solid rgba(12,20,36,0.6)",
                          minHeight: "68px",
                        }}
                      />
                    );
                  }

                  const actorsForTech = techActorMap.get(tech.id);
                  const count         = actorsForTech?.length ?? 0;
                  const base          = cellStyle(count);

                  return (
                    <div
                      key={tech.id}
                      className="px-3 py-2.5 transition-colors duration-150"
                      style={{
                        backgroundColor: base.backgroundColor as string,
                        boxShadow: base.boxShadow as string | undefined,
                        borderRight: colIdx < TACTICS.length - 1 ? "1px solid rgba(15,25,44,0.5)" : undefined,
                        borderBottom: "1px solid rgba(12,20,36,0.6)",
                        minHeight: "68px",
                        cursor: count > 0 ? "pointer" : "default",
                      }}
                      onClick={() => count > 0 && handleCellClick(tech)}
                      onMouseEnter={(e) => {
                        const hover = cellHoverStyle(count);
                        const el = e.currentTarget as HTMLElement;
                        el.style.backgroundColor = hover.backgroundColor as string;
                        if (hover.boxShadow) el.style.boxShadow = hover.boxShadow as string;
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.backgroundColor = base.backgroundColor as string;
                        el.style.boxShadow = (base.boxShadow as string) ?? "";
                      }}
                    >
                      <div
                        className="text-[10px] font-mono font-bold mb-1"
                        style={{ color: count > 0 ? "rgba(34,211,238,0.9)" : "rgba(30,41,59,0.6)" }}
                      >
                        {tech.id}
                      </div>
                      <div
                        className="text-[11px] font-medium leading-snug"
                        style={{ color: count > 0 ? "rgba(226,232,240,0.9)" : "rgba(30,41,59,0.55)" }}
                      >
                        {tech.name}
                      </div>
                      {count > 0 && (
                        <div
                          className="mt-1 text-[9px] font-mono"
                          style={{
                            color: count >= 6
                              ? "rgba(34,211,238,0.95)"
                              : count >= 3
                              ? "rgba(34,211,238,0.7)"
                              : "rgba(34,211,238,0.5)",
                          }}
                        >
                          {count} actor{count !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Modal */}
      {selected && (
        <TechniqueModal
          technique={selected.tech}
          actors={selected.actors}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
