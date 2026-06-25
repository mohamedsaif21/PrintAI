"use client";
import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: "up" | "down" | "neutral";
}

interface MetricStripProps {
  metrics: Metric[];
  className?: string;
}

export function MetricStrip({ metrics, className }: MetricStripProps) {
  return (
    <div className={cn("flex items-stretch divide-x divide-[var(--border-default)]", className)}>
      {metrics.map((m, i) => (
        <div key={i} className="flex-1 px-5 first:pl-0 last:pr-0">
          <p className="text-[var(--text-card-label)] font-medium text-[var(--text-secondary)]">
            {m.label}
          </p>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-[var(--text-card-metric)] font-bold text-[var(--text-primary)] leading-tight tabular-nums">
              {m.value}
            </span>
            {m.delta && (
              <span
                className={cn(
                  "text-[var(--text-helper)] font-medium",
                  m.deltaType === "up" && "text-[var(--status-success)]",
                  m.deltaType === "down" && "text-[var(--status-danger)]",
                  (!m.deltaType || m.deltaType === "neutral") && "text-[var(--text-muted)]"
                )}
              >
                {m.deltaType === "up" && "▲ "}
                {m.deltaType === "down" && "▼ "}
                {m.delta}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
