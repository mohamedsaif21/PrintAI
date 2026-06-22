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
    <aside className="w-52 min-w-[208px] h-screen flex flex-col pb-6" style={{ backgroundColor: 'rgb(82, 82, 82)', borderRight: '1px solid rgb(82, 82, 82)' }}>
      <div className="px-4 py-5" style={{ borderBottom: '1px solid rgb(82, 82, 82)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">PrintAI</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Production Planner</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-4 space-y-2 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                "w-full flex items-center gap-4 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 text-left font-medium",
                isActive
                  ? "bg-white text-black border-l-[4px] border-blue-600 rounded-l-none"
                  : "text-gray-300 hover:bg-white hover:text-black"
              )}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}