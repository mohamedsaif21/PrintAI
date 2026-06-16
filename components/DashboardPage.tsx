"use client";
import { Order, Machine, ScheduleResult } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, AlertTriangle, Clock, Cpu, FileText } from "lucide-react";

interface Props {
  orders: Order[];
  machines: Machine[];
  lastSchedule: ScheduleResult | null;
  notifications: { msg: string; type: "success" | "warn" | "info" }[];
}

function MetricCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub: string; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>
    </div>
  );
}

export function DashboardPage({ orders, machines, lastSchedule, notifications }: Props) {
  const scheduled = orders.filter((o) => o.status === "Scheduled" || o.status === "In Progress" || o.status === "Pending Approval").length;
  const active = machines.filter((m) => m.status === "available").length;
  const slaRisk = orders.filter((o) => o.status === "At Risk").length;
  const latestOrder = lastSchedule ? orders.find((order) => order.id === lastSchedule.orderId) : null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total orders" value={orders.length} sub={`${scheduled} active`} icon={FileText} color="bg-blue-500" />
        <MetricCard label="Active machines" value={active} sub={`${machines.filter(m=>m.status==='busy').length} busy · ${machines.filter(m=>m.status==='backup').length} backup`} icon={Cpu} color="bg-violet-500" />
        <MetricCard label="SLA compliance" value={slaRisk === 0 ? "100%" : `${Math.round(((orders.length - slaRisk) / orders.length) * 100)}%`} sub={slaRisk === 0 ? "All on track" : `${slaRisk} at risk`} icon={CheckCircle2} color="bg-emerald-500" />
        <MetricCard label="Sheets scheduled" value={orders.reduce((s, o) => s + o.quantity, 0).toLocaleString()} sub="across all orders" icon={Clock} color="bg-amber-500" />
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.slice(0, 3).map((n, i) => (
            <div key={i} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${n.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" : n.type === "warn" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"}`}>
              {n.type === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
              {n.msg}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Orders overview */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Recent orders</h3>
          <div className="space-y-2">
            {orders.slice(0, 5).map((o) => (
              <div key={o.id} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-24 font-mono">{o.id}</span>
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{o.product}</span>
                <span className="text-xs text-gray-400">{o.quantity.toLocaleString()}</span>
                <Badge variant={o.status === "Scheduled" || o.status === "In Progress" ? "safe" : o.status === "At Risk" ? "risk" : "warn"}>
                  {o.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Machine utilisation */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Machine utilisation</h3>
          <div className="space-y-3">
            {machines.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <span className="text-sm font-medium w-8 text-gray-700 dark:text-gray-300">{m.id}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${m.status === "available" ? "bg-emerald-500" : m.status === "busy" ? "bg-amber-500" : "bg-gray-400"}`}
                    style={{ width: `${m.utilisation}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-12 text-right">{m.status === "busy" ? "Busy" : m.status === "backup" ? "Standby" : `${m.utilisation}%`}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {lastSchedule && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Latest AI schedule result</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {lastSchedule.orderId}
                {latestOrder ? ` - ${latestOrder.product} for ${latestOrder.customer}` : ""}
              </p>
            </div>
            <Badge variant={lastSchedule.slaStatus === "SAFE" ? "safe" : "risk"}>SLA {lastSchedule.slaStatus}</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {lastSchedule.tasks.map((task) => (
              <div key={task.machineId} className="rounded-lg bg-gray-50 dark:bg-gray-800 p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{task.machineId}</p>
                  <span className="text-xs text-gray-500">{task.estimatedHours}h</span>
                </div>
                <p className="text-xs text-gray-500">{task.assignedQty.toLocaleString()} sheets assigned</p>
                <p className="text-xs text-gray-400 mt-1">
                  Finish {new Date(task.estimatedFinish).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
