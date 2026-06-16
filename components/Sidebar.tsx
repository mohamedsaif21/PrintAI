"use client";
import { LayoutDashboard, FileText, Cpu, Bot, BarChart3, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "dashboard", label: "Dashboard",   icon: LayoutDashboard },
  { id: "orders",   label: "Orders",     icon: FileText },
  { id: "machines", label: "Machines",   icon: Cpu },
  { id: "schedule",  label: "AI Schedule", icon: Bot },
  { id: "reports",   label: "Reports",     icon: BarChart3 },
];

export function Sidebar({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  return (
    <aside className="w-52 min-w-[208px] h-screen bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-none">PrintAI</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Production Planner</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-3 space-y-0.5 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left",
                active === item.id
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-gray-200 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 dark:text-gray-600">Powered by Gemini AI</p>
      </div>
    </aside>
  );
}
