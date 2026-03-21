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
    return { label: "Unknown", cls: "bg-slate-500/20 text-slate-400 ring-1 ring-slate-500/30", textCls: "text-slate-400", barCls: "bg-slate-500", dotCls: "bg-slate-400" };
  }
  if (score >= 8.5)  return { label: "Critical", cls: "bg-red-500/20 text-red-400 ring-1 ring-red-500/30",          textCls: "text-red-400",    barCls: "bg-red-500",    dotCls: "bg-red-400" };
  if (score >= 7)    return { label: "High",     cls: "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30", textCls: "text-orange-400", barCls: "bg-orange-500", dotCls: "bg-orange-400" };
  if (score >= 4)    return { label: "Medium",   cls: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30",    textCls: "text-amber-400",  barCls: "bg-amber-500",  dotCls: "bg-amber-400" };
  return             { label: "Low",      cls: "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30",      textCls: "text-blue-400",   barCls: "bg-blue-500",   dotCls: "bg-blue-400" };
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
