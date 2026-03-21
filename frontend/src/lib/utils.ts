import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface SeverityInfo {
  label: string;
  cls: string;       // Tailwind class for text+bg+border
  textCls: string;   // just text color
  barCls: string;    // progress bar color
  dotCls: string;    // small dot color
}

export function getSeverity(score: number | null | undefined): SeverityInfo {
  if (score === null || score === undefined) {
    return { label: "Unknown", cls: "bg-muted/20 text-muted-foreground border-muted/30", textCls: "text-muted-foreground", barCls: "bg-muted-foreground", dotCls: "bg-muted-foreground" };
  }
  if (score >= 8.5)  return { label: "Critical", cls: "bg-[#ef4444]/15 text-[#f87171] border-[#ef4444]/30", textCls: "text-[#f87171]", barCls: "bg-[#ef4444]", dotCls: "bg-[#ef4444]" };
  if (score >= 7)  return { label: "High",     cls: "bg-[#f97316]/15 text-[#fb923c] border-[#f97316]/30", textCls: "text-[#fb923c]", barCls: "bg-[#f97316]", dotCls: "bg-[#f97316]" };
  if (score >= 4)  return { label: "Medium",   cls: "bg-[#eab308]/15 text-[#fbbf24] border-[#eab308]/30", textCls: "text-[#fbbf24]", barCls: "bg-[#eab308]", dotCls: "bg-[#eab308]" };
  return               { label: "Low",      cls: "bg-[#22c55e]/15 text-[#4ade80] border-[#22c55e]/30", textCls: "text-[#4ade80]", barCls: "bg-[#22c55e]", dotCls: "bg-[#22c55e]" };
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Severity filter → backend query params
export function severityFilterToParams(filter: string): Record<string, string> {
  switch (filter) {
    case "critical": return { severity_min: "8.5" };
    case "high":     return { severity_min: "7", severity_max: "8.49" };
    case "medium":   return { severity_min: "4", severity_max: "6.99" };
    case "low":      return { severity_max: "3.99" };
    default:         return {};
  }
}
