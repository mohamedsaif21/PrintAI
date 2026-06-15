"use client";
import { Order, ScheduleResult } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { Bot, CheckCircle2, AlertTriangle, Cpu, Clock, ShieldAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  schedule: ScheduleResult | null;
  order: Order | null;
}

const STEP_LABELS = [
  "Read incoming order",
  "Check machine availability",
  "Verify paper type compatibility",
  "Calculate SLA & deadline risk",
  "Split workload proportionally",
  "Generate final schedule",
];

const BAR_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444"];

export function SchedulePage({ schedule, order }: Props) {
  if (!schedule || !order) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-10 text-center">
        <Bot className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No schedule yet. Submit an order from the Orders page to see the AI schedule here.</p>
      </div>
    );
  }

  const chartData = schedule.tasks.map((t) => ({
    name: t.machineId,
    qty: t.assignedQty,
    hours: t.estimatedHours,
  }));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Schedule for {order.id}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{order.quantity.toLocaleString()} × {order.product} for {order.customer}</p>
          </div>
          <Badge variant={schedule.slaStatus === "SAFE" ? "safe" : "risk"} className="text-sm px-3 py-1">
            SLA {schedule.slaStatus}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs text-gray-500">Estimated finish</p>
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{format(new Date(schedule.overallFinish), "h:mm a")}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {schedule.slaStatus === "SAFE" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
              <p className="text-xs text-gray-500">Deadline</p>
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{format(new Date(order.deadline), "h:mm a")}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Cpu className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs text-gray-500">Machines used</p>
            </div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{schedule.tasks.length}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* AI steps */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">AI decision steps</h3>
          <div className="space-y-3">
            {STEP_LABELS.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center justify-center flex-shrink-0 text-xs font-semibold">{i + 1}</div>
                <div>
                  <p className="text-sm text-gray-800 dark:text-gray-200">{step}</p>
                  {i === 3 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {Math.abs(schedule.slaDiff)} min {schedule.slaDiff >= 0 ? "ahead of" : "behind"} deadline
                    </p>
                  )}
                  {i === 4 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {schedule.tasks.map(t => `${t.machineId}: ${t.assignedQty.toLocaleString()}`).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Workload chart */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Workload distribution</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (v as number).toLocaleString() + " pcs"} />
              <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-4">
            {schedule.tasks.map((t, i) => (
              <div key={t.machineId} className="flex items-center gap-3">
                <span className="text-sm font-medium w-8" style={{ color: BAR_COLORS[i % BAR_COLORS.length] }}>{t.machineId}</span>
                <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${Math.round((t.assignedQty / order.quantity) * 100)}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                </div>
                <span className="text-xs text-gray-400">{t.assignedQty.toLocaleString()} · {t.estimatedHours}h</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Risk Analysis */}
      {schedule.risk && (
        <div className={`rounded-xl border p-5 ${
          schedule.risk.riskLevel === "HIGH"
            ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
            : schedule.risk.riskLevel === "MEDIUM"
            ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
            : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {schedule.risk.riskLevel === "HIGH" ? (
                <ShieldAlert className="w-5 h-5 text-red-600" />
              ) : schedule.risk.riskLevel === "MEDIUM" ? (
                <ShieldOff className="w-5 h-5 text-amber-600" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              )}
              <p className={`text-sm font-semibold ${
                schedule.risk.riskLevel === "HIGH" ? "text-red-700 dark:text-red-300"
                : schedule.risk.riskLevel === "MEDIUM" ? "text-amber-700 dark:text-amber-300"
                : "text-emerald-700 dark:text-emerald-300"
              }`}>AI Risk Analysis</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Risk Score</span>
              <span className={`text-lg font-bold ${
                schedule.risk.riskLevel === "HIGH" ? "text-red-600"
                : schedule.risk.riskLevel === "MEDIUM" ? "text-amber-600"
                : "text-emerald-600"
              }`}>{schedule.risk.riskScore}/100</span>
            </div>
          </div>
          {schedule.risk.anomalies.length > 0 && (
            <div className="mb-3 space-y-1">
              {schedule.risk.anomalies.map((a, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-500" />
                  {a}
                </div>
              ))}
            </div>
          )}
          <p className="text-sm text-gray-700 dark:text-gray-300">{schedule.risk.recommendation}</p>
        </div>
      )}

      {/* Gemini explanation */}
      <div className="bg-gradient-to-br from-blue-50 to-violet-50 dark:from-blue-950/30 dark:to-violet-950/30 rounded-xl border border-blue-200 dark:border-blue-800 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Gemini AI explanation</p>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {schedule.explanation || "AI explanation will appear here after scheduling."}
        </p>
      </div>
    </div>
  );
}
