"use client";
import { cn } from "@/lib/utils";

type StatusVariant = "success" | "warning" | "danger" | "info" | "muted";

const dotMap: Record<StatusVariant, string> = {
  success: "bg-[var(--status-success)]",
  warning: "bg-[var(--status-warning)]",
  danger: "bg-[var(--status-danger)]",
  info: "bg-[var(--status-info)]",
  muted: "bg-[var(--text-muted)]",
};

const bgMap: Record<StatusVariant, string> = {
  success: "bg-[var(--status-success-bg)] text-[var(--status-success)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger)]",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info)]",
  muted: "bg-gray-100 text-[var(--text-muted)]",
};

interface StatusPillProps {
  variant: StatusVariant;
  label: string;
  dot?: boolean;
  className?: string;
}

export function StatusPill({ variant, label, dot = true, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
        "text-[var(--text-badge)] font-semibold uppercase tracking-wide",
        bgMap[variant],
        className
      )}
    >
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full", dotMap[variant])} />}
      {label}
    </span>
  );
}
