"use client";
import { useState } from "react";
import { Machine, ScheduleResult } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, RefreshCw, Loader2, Zap } from "lucide-react";
import { ScheduledTask } from "@/types";

interface Props {
  machines: Machine[];
  lastSchedule: ScheduleResult | null;
  onFailure: (result: { newTasks: ScheduledTask[]; result: ScheduleResult; failedMachineId: string; backupMachineId: string; remainingQty: number }) => void;
  onReset: () => void;
}

const statusConfig = {
  available: { dot: "bg-emerald-500", badge: "safe" as const, label: "Available" },
  busy:      { dot: "bg-amber-500",   badge: "warn" as const, label: "Busy" },
  backup:    { dot: "bg-gray-400",    badge: "gray" as const, label: "Standby" },
  breakdown: { dot: "bg-red-500",     badge: "risk" as const, label: "Breakdown" },
};

export function MachinesPage({ machines, lastSchedule, onFailure, onReset }: Props) {
  const [failTarget, setFailTarget] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState<{ type: "warn"|"success"|"info"; msg: string }[]>([]);

  async function triggerFailure() {
    setLoading(true);
    setNotif([]);
    try {
      const res = await fetch("/api/simulate-failure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          failedMachineId: failTarget,
          orderId: lastSchedule?.orderId || "ORD-DEMO",
          tasks: lastSchedule?.tasks || null,
          completedFraction: 0.5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onFailure(data);
      setNotif([
        { type: "warn",    msg: `${failTarget} breakdown detected — ${data.remainingQty.toLocaleString()} pieces remaining.` },
        { type: "info",    msg: `AI reassigned ${data.remainingQty.toLocaleString()} pieces to ${data.backupMachineId}.` },
        { type: "success", msg: `New schedule generated. SLA: ${data.result.slaStatus}. ${data.result.explanation || ""}` },
      ]);
    } catch (err: unknown) {
      setNotif([{ type: "warn", msg: err instanceof Error ? err.message : "Simulation failed" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {machines.map((m) => {
          const cfg = statusConfig[m.status];
          return (
            <div key={m.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{m.id}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.speed} sheets/hr · {m.capacity.toLocaleString()}/day</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <Badge variant={cfg.badge}>{cfg.label}</Badge>
                </div>
              </div>
              <p className="text-xs text-gray-400 mb-2">Papers: {m.paperTypes.join(", ")}</p>
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${m.status === "available" ? "bg-emerald-500" : m.status === "busy" ? "bg-amber-500" : "bg-gray-400"}`}
                  style={{ width: `${m.utilisation}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{m.utilisation}% utilised</p>
            </div>
          );
        })}
      </div>

      {/* Failure simulator */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Breakdown simulator</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Simulate a mid-run machine failure. The AI will automatically reassign remaining work to the backup machine and recalculate SLA.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={failTarget} onChange={(e) => setFailTarget(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {machines.filter(m => m.status === "available").map(m => <option key={m.id}>{m.id}</option>)}
          </select>
          <button onClick={triggerFailure} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            {loading ? "Simulating…" : "Trigger breakdown"}
          </button>
          <button onClick={() => { onReset(); setNotif([]); }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
        </div>

        {notif.length > 0 && (
          <div className="mt-4 space-y-2">
            {notif.map((n, i) => (
              <div key={i} className={`px-4 py-2.5 rounded-lg text-sm flex items-start gap-2 ${n.type === "warn" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : n.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"}`}>
                {n.type === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {n.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
