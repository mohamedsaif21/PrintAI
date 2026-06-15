"use client";
import { cn } from "@/lib/utils";

type Variant = "safe" | "risk" | "warn" | "info" | "gray" | "high" | "medium" | "low";

const variantClasses: Record<Variant, string> = {
  safe:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  risk:   "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  warn:   "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  info:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  gray:   "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  high:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low:    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function Badge({ variant, children, className }: { variant: Variant; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", variantClasses[variant], className)}>
      {children}
    </span>
  );
}
