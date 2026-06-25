"use client";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertType = "warn" | "danger" | "info" | "success";

interface AlertStripProps {
  type: AlertType;
  message: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

const config: Record<AlertType, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  warn: {
    bg: "bg-[var(--status-warning-bg)]",
    border: "border-[var(--status-warning)]",
    text: "text-[var(--status-warning)]",
    icon: AlertTriangle,
  },
  danger: {
    bg: "bg-[var(--status-danger-bg)]",
    border: "border-[var(--status-danger)]",
    text: "text-[var(--status-danger)]",
    icon: AlertTriangle,
  },
  info: {
    bg: "bg-[var(--status-info-bg)]",
    border: "border-[var(--status-info)]",
    text: "text-[var(--status-info)]",
    icon: Info,
  },
  success: {
    bg: "bg-[var(--status-success-bg)]",
    border: "border-[var(--status-success)]",
    text: "text-[var(--status-success)]",
    icon: CheckCircle2,
  },
};

export function AlertStrip({ type, message, action, className }: AlertStripProps) {
  const c = config[type];
  const Icon = c.icon;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg border",
        c.bg, c.border,
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className={cn("w-4 h-4 flex-shrink-0", c.text)} />
        <span className="text-sm text-[var(--text-primary)] truncate">{message}</span>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            "text-xs font-semibold whitespace-nowrap flex-shrink-0",
            c.text, "hover:underline"
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
