"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api.client";
import { ArrowLeft, Grid3X3, X, Users, Loader2 } from "lucide-react";
import Link from "next/link";

/* ─── Static MITRE ATT&CK Enterprise data ──────────────────────────────── */
interface MitreTechnique {
  id: string;
  name: string;
}
interface MitreTactic {
  id: string;
  name: string;
  short: string;
  techniques: MitreTechnique[];
}

const TACTICS: MitreTactic[] = [
  {
    id: "TA0001", name: "Initial Access", short: "Initial Access",
    techniques: [
      { id: "T1078", name: "Valid Accounts" },
      { id: "T1190", name: "Exploit Public-Facing Application" },
      { id: "T1133", name: "External Remote Services" },
      { id: "T1566", name: "Phishing" },
      { id: "T1189", name: "Drive-by Compromise" },
      { id: "T1195", name: "Supply Chain Compromise" },
      { id: "T1199", name: "Trusted Relationship" },
      { id: "T1200", name: "Hardware Additions" },
      { id: "T1091", name: "Replication Through Removable Media" },
    ],
  },
  {
    id: "TA0002", name: "Execution", short: "Execution",
    techniques: [
      { id: "T1059", name: "Command & Scripting Interpreter" },
      { id: "T1203", name: "Exploitation for Client Execution" },
      { id: "T1106", name: "Native API" },
      { id: "T1053", name: "Scheduled Task/Job" },
      { id: "T1047", name: "Windows Management Instrumentation" },
      { id: "T1204", name: "User Execution" },
      { id: "T1072", name: "Software Deployment Tools" },
      { id: "T1129", name: "Shared Modules" },
      { id: "T1569", name: "System Services" },
    ],
  },
  {
    id: "TA0003", name: "Persistence", short: "Persistence",
    techniques: [
      { id: "T1543", name: "Create or Modify System Process" },
      { id: "T1547", name: "Boot or Logon Autostart Execution" },
      { id: "T1136", name: "Create Account" },
      { id: "T1505", name: "Server Software Component" },
      { id: "T1098", name: "Account Manipulation" },
      { id: "T1197", name: "BITS Jobs" },
      { id: "T1176", name: "Browser Extensions" },
      { id: "T1554", name: "Compromise Client Software Binary" },
      { id: "T1546", name: "Event Triggered Execution" },
      { id: "T1574", name: "Hijack Execution Flow" },
    ],
  },
  {
    id: "TA0004", name: "Privilege Escalation", short: "Priv Esc",
    techniques: [
      { id: "T1548", name: "Abuse Elevation Control Mechanism" },
      { id: "T1134", name: "Access Token Manipulation" },
      { id: "T1068", name: "Exploitation for Privilege Escalation" },
      { id: "T1055", name: "Process Injection" },
      { id: "T1484", name: "Domain Policy Modification" },
      { id: "T1611", name: "Escape to Host" },
      { id: "T1574", name: "Hijack Execution Flow" },
      { id: "T1053", name: "Scheduled Task/Job" },
    ],
  },
  {
    id: "TA0005", name: "Defense Evasion", short: "Def Evasion",
    techniques: [
      { id: "T1027", name: "Obfuscated Files or Information" },
      { id: "T1562", name: "Impair Defenses" },
      { id: "T1070", name: "Indicator Removal" },
      { id: "T1036", name: "Masquerading" },
      { id: "T1112", name: "Modify Registry" },
      { id: "T1218", name: "System Binary Proxy Execution" },
      { id: "T1553", name: "Subvert Trust Controls" },
      { id: "T1055", name: "Process Injection" },
      { id: "T1497", name: "Virtualization/Sandbox Evasion" },
      { id: "T1620", name: "Reflective Code Loading" },
    ],
  },
  {
    id: "TA0006", name: "Credential Access", short: "Cred Access",
    techniques: [
      { id: "T1110", name: "Brute Force" },
      { id: "T1555", name: "Credentials from Password Stores" },
      { id: "T1003", name: "OS Credential Dumping" },
      { id: "T1056", name: "Input Capture" },
      { id: "T1557", name: "Adversary-in-the-Middle" },
      { id: "T1558", name: "Steal or Forge Kerberos Tickets" },
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
      { id: "T1016", name: "System Network Config Discovery" },
      { id: "T1049", name: "System Network Connections Discovery" },
      { id: "T1033", name: "System Owner/User Discovery" },
    ],
  },
  {
    id: "TA0008", name: "Lateral Movement", short: "Lateral Mvmt",
    techniques: [
      { id: "T1210", name: "Exploitation of Remote Services" },
      { id: "T1534", name: "Internal Spearphishing" },
      { id: "T1570", name: "Lateral Tool Transfer" },
      { id: "T1563", name: "Remote Service Session Hijacking" },
      { id: "T1021", name: "Remote Services" },
      { id: "T1091", name: "Replication Through Removable Media" },
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
      { id: "T1213", name: "Data from Information Repositories" },
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
      { id: "T1095", name: "Non-Application Layer Protocol" },
      { id: "T1572", name: "Protocol Tunneling" },
      { id: "T1090", name: "Proxy" },
    ],
  },
  {
    id: "TA0010", name: "Exfiltration", short: "Exfiltration",
    techniques: [
      { id: "T1020", name: "Automated Exfiltration" },
      { id: "T1030", name: "Data Transfer Size Limits" },
      { id: "T1048", name: "Exfiltration Over Alternative Protocol" },
      { id: "T1041", name: "Exfiltration Over C2 Channel" },
      { id: "T1011", name: "Exfiltration Over Other Network Medium" },
      { id: "T1052", name: "Exfiltration Over Physical Medium" },
      { id: "T1567", name: "Exfiltration Over Web Service" },
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
      { id: "T1499", name: "Endpoint Denial of Service" },
      { id: "T1495", name: "Firmware Corruption" },
      { id: "T1490", name: "Inhibit System Recovery" },
      { id: "T1498", name: "Network Denial of Service" },
      { id: "T1496", name: "Resource Hijacking" },
      { id: "T1489", name: "Service Stop" },
    ],
  },
];

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface Actor {
  id: string;
  mitre_id: string;
  name: string;
  techniques: { id: string; name: string }[];
}

/* ─── Modal ──────────────────────────────────────────────────────────────── */
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
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-lg border overflow-hidden"
        style={{ background: "var(--card)", borderColor: "rgba(56,189,248,0.3)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span
                className="font-mono text-xs px-1.5 py-0.5 rounded"
                style={{ background: "rgba(56,189,248,0.08)", color: "var(--primary)", border: "1px solid rgba(56,189,248,0.2)" }}
              >
                {technique.id}
              </span>
            </div>
            <h2 className="text-sm font-bold font-heading" style={{ color: "var(--foreground)" }}>
              {technique.name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded transition-colors"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Actor list */}
        <div className="p-5">
          <div className="text-[9px] uppercase tracking-widest mb-3 font-semibold" style={{ color: "var(--muted-foreground)" }}>
            {actors.length} threat actor{actors.length !== 1 ? "s" : ""} use this technique
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {actors.map((a) => (
              <Link
                key={a.id}
                href={`/threat-actors/${a.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded border transition-all"
                style={{ background: "var(--muted)", borderColor: "var(--border)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(56,189,248,0.3)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                }}
              >
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: "rgba(56,189,248,0.08)", color: "var(--primary)", border: "1px solid rgba(56,189,248,0.2)" }}
                >
                  {a.mitre_id}
                </span>
                <span className="text-sm font-medium flex-1" style={{ color: "var(--foreground)" }}>
                  {a.name}
                </span>
              </Link>
            ))}
          </div>
          <a
            href={`https://attack.mitre.org/techniques/${technique.id}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 rounded border text-xs transition-all"
            style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(56,189,248,0.3)";
              (e.currentTarget as HTMLElement).style.color = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLElement).style.color = "var(--muted-foreground)";
            }}
          >
            View on MITRE ATT&CK ↗
          </a>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function AttackMatrixPage() {
  const [actors, setActors] = useState<Actor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ tech: MitreTechnique; actors: Actor[] } | null>(null);

  useEffect(() => {
    async function loadAllActors() {
      try {
        // Fetch up to 200 actors (enough for all MITRE groups)
        const res = await fetchApi("/api/threat-actors?page_size=200&page=1");
        const items: { id: string; mitre_id: string; name: string }[] = res?.items ?? [];

        // For each actor, fetch their techniques
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
    loadAllActors();
  }, []);

  // Build technique → actors map
  const techActorMap = new Map<string, Actor[]>();
  for (const actor of actors) {
    for (const t of actor.techniques) {
      // Normalize: strip sub-technique suffix (T1059.001 → T1059)
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/threat-actors"
          className="inline-flex items-center gap-1.5 text-xs transition-colors"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ArrowLeft className="w-3 h-3" />
          Threat Actors
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold font-heading flex items-center gap-2" style={{ color: "var(--foreground)" }}>
            <Grid3X3 className="w-5 h-5" style={{ color: "var(--primary)" }} />
            MITRE ATT&CK Matrix
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            Enterprise techniques — highlighted cells are used by threat actors in this database
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {loading ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading actors…
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
                style={{ background: "rgba(20,184,166,0.1)", border: "1px solid rgba(20,184,166,0.25)", color: "#2dd4bf" }}
              >
                <span className="w-2 h-2 rounded-sm" style={{ background: "rgba(20,184,166,0.6)" }} />
                {totalHighlighted} technique{totalHighlighted !== 1 ? "s" : ""} observed
              </div>
              <div
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded"
                style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                <Users className="w-3 h-3" />
                {actors.length} actors
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded text-sm" style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px]" style={{ color: "var(--muted-foreground)" }}>
        <div className="flex items-center gap-1.5">
          <span
            className="w-4 h-4 rounded"
            style={{ background: "rgba(20,184,166,0.15)", border: "1px solid rgba(20,184,166,0.4)" }}
          />
          Used by tracked actor — click to see details
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-4 h-4 rounded"
            style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
          />
          Not observed in database
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
        <div style={{ minWidth: `${TACTICS.length * 140}px` }}>
          {/* Tactic headers */}
          <div
            className="grid border-b"
            style={{
              gridTemplateColumns: `repeat(${TACTICS.length}, minmax(130px, 1fr))`,
              borderColor: "var(--border)",
              background: "var(--card)",
            }}
          >
            {TACTICS.map((tactic) => (
              <div
                key={tactic.id}
                className="px-2.5 py-2.5 border-r last:border-r-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="text-[9px] font-mono" style={{ color: "var(--muted-foreground)" }}>
                  {tactic.id}
                </div>
                <div
                  className="text-[11px] font-semibold font-heading leading-tight mt-0.5"
                  style={{ color: "var(--foreground)" }}
                >
                  {tactic.short}
                </div>
                <div className="text-[9px] mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                  {tactic.techniques.length} techniques
                </div>
              </div>
            ))}
          </div>

          {/* Technique cells — render row by row based on max techniques per tactic */}
          {(() => {
            const maxRows = Math.max(...TACTICS.map((t) => t.techniques.length));
            return Array.from({ length: maxRows }).map((_, rowIdx) => (
              <div
                key={rowIdx}
                className="grid border-b last:border-b-0"
                style={{
                  gridTemplateColumns: `repeat(${TACTICS.length}, minmax(130px, 1fr))`,
                  borderColor: "var(--border)",
                }}
              >
                {TACTICS.map((tactic) => {
                  const tech = tactic.techniques[rowIdx];
                  if (!tech) {
                    return (
                      <div
                        key={`${tactic.id}-empty-${rowIdx}`}
                        className="border-r last:border-r-0"
                        style={{ borderColor: "var(--border)", background: "var(--background)", minHeight: "52px" }}
                      />
                    );
                  }

                  const actorsForTech = techActorMap.get(tech.id);
                  const isHighlighted = !!actorsForTech && actorsForTech.length > 0;

                  return (
                    <div
                      key={tech.id}
                      className="border-r last:border-r-0 px-2 py-2 transition-all"
                      style={{
                        borderColor: "var(--border)",
                        background: isHighlighted
                          ? "rgba(20,184,166,0.08)"
                          : "var(--card)",
                        cursor: isHighlighted ? "pointer" : "default",
                        borderLeft: isHighlighted ? "2px solid rgba(20,184,166,0.5)" : undefined,
                        minHeight: "52px",
                      }}
                      onClick={() => handleCellClick(tech)}
                      onMouseEnter={(e) => {
                        if (isHighlighted) {
                          (e.currentTarget as HTMLElement).style.background = "rgba(20,184,166,0.15)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (isHighlighted) {
                          (e.currentTarget as HTMLElement).style.background = "rgba(20,184,166,0.08)";
                        }
                      }}
                    >
                      <div
                        className="text-[9px] font-mono mb-0.5"
                        style={{ color: isHighlighted ? "#2dd4bf" : "var(--muted-foreground)" }}
                      >
                        {tech.id}
                      </div>
                      <div
                        className="text-[10px] font-medium leading-snug"
                        style={{ color: isHighlighted ? "#f0fdfa" : "var(--muted-foreground)" }}
                      >
                        {tech.name}
                      </div>
                      {isHighlighted && actorsForTech && (
                        <div className="mt-0.5 text-[9px]" style={{ color: "rgba(45,212,191,0.7)" }}>
                          {actorsForTech.length} actor{actorsForTech.length !== 1 ? "s" : ""}
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
