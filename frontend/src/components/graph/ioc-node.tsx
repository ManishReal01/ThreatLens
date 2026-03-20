import { Handle, Position, NodeProps } from "@xyflow/react";
import { Globe, Link as LinkIcon, Hash, Fingerprint } from "lucide-react";
import { getSeverity } from "@/lib/utils";

const typeConfig: Record<string, { icon: React.ElementType; cls: string }> = {
  ipv4:        { icon: Globe,    cls: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  domain:      { icon: LinkIcon, cls: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  url:         { icon: LinkIcon, cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  hash_md5:    { icon: Hash,     cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  hash_sha1:   { icon: Hash,     cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  hash_sha256: { icon: Hash,     cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  default:     { icon: Fingerprint, cls: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
};

export function IOCNode({ data }: NodeProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { value, type, severity, isRoot } = data as any;
  const cfg = typeConfig[type] ?? typeConfig.default;
  const Icon = cfg.icon;
  const sev = getSeverity(severity);

  return (
    <div
      className="relative min-w-[220px] rounded-lg p-3 transition-all"
      style={{
        background: isRoot ? "rgba(56,189,248,0.08)" : "var(--card)",
        border: isRoot ? "1px solid rgba(56,189,248,0.35)" : "1px solid var(--border)",
        boxShadow: isRoot ? "0 0 16px -4px rgba(56,189,248,0.2)" : "none",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "var(--border)", border: "none", width: 6, height: 6 }}
      />

      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded border flex-shrink-0 ${cfg.cls}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-semibold truncate font-mono"
            style={{ color: isRoot ? "var(--primary)" : "var(--foreground)", fontFamily: "var(--font-mono)" }}
            title={value}
          >
            {value.length > 22 ? value.substring(0, 22) + "…" : value}
          </div>
          <div className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: "var(--muted-foreground)" }}>
            {type.replace("hash_", "")}
          </div>
        </div>

        <span
          className={`text-[8px] px-1.5 py-0.5 rounded uppercase font-semibold border flex-shrink-0 ${sev.cls}`}
        >
          {sev.label}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "var(--border)", border: "none", width: 6, height: 6 }}
      />
    </div>
  );
}
