"use client";
import { cn } from "@/lib/utils";

type Variant = "safe" | "risk" | "warn" | "info" | "gray" | "high" | "medium" | "low";

const variantClasses: Record<Variant, string> = {
  safe:   "bg-emerald-100 text-emerald-800",
  risk:   "bg-red-100 text-red-800",
  warn:   "bg-amber-100 text-amber-800",
  info:   "bg-blue-100 text-blue-800",
  gray:   "bg-gray-100 text-gray-600",
  high:   "",
  medium: "",
  low:    "",
};

const variantStyles: Partial<Record<Variant, React.CSSProperties>> = {
  high: { backgroundColor: 'rgb(250,135,135)', color: '#000000' },
  medium: { backgroundColor: 'rgb(250,189,135)', color: '#000000' },
  low: { backgroundColor: 'rgb(250,227,135)', color: '#000000' }
};

export function Badge({ variant, children, className }: { variant: Variant; children: React.ReactNode; className?: string }) {
  const style = variantStyles[variant];
  return (
    <span 
      className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", variantClasses[variant], className)}
      style={style}
    >
      {children}
    </span>
  );
}
