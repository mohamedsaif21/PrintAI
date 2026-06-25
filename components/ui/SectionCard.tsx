"use client";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}

export function SectionCard({
  title,
  actions,
  children,
  variant = "primary",
  className,
}: SectionCardProps) {
  return (
    <div
      className={cn(
        variant === "primary"
          ? "bg-[var(--elevated-surface)] border border-[var(--border-default)] rounded-[var(--radius-lg)] shadow-[var(--shadow-elevated)]"
          : "bg-[var(--elevated-surface)] border border-[var(--border-default)] rounded-[var(--radius-md)]",
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between px-5 pt-5 pb-0">
          <h3 className="text-[var(--text-section-title)] font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", title && "pt-4")}>{children}</div>
    </div>
  );
}
