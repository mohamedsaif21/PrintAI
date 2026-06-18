"use client";
import { Order, ScheduleResult } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { differenceInMinutes, format } from "date-fns";
import { Bot, CheckCircle2, AlertTriangle, Cpu, Clock, ShieldAlert, ShieldCheck, ShieldOff, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface Props {
  schedule: ScheduleResult | null;
  order: Order | null;
  onApprovalDecision: (orderId: string, status: "In Progress" | "At Risk" | "Rejected") => void;
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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function SchedulePage({ schedule, order, onApprovalDecision }: Props) {
  if (!schedule || !order) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-10 text-center">
        <Bot className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-400">No schedule yet. Submit an order from the Orders page to see the AI schedule here.</p>
      </div>
    );
  }

  const now = new Date();
  const createdAt = new Date(order.createdAt);
  const deadline = new Date(order.deadline);
  const finish = new Date(schedule.overallFinish);
  const delayMinutes = Math.max(0, differenceInMinutes(finish, deadline));
  const averagePlannedShare = order.quantity / Math.max(schedule.tasks.length, 1);
  const executionRows = schedule.tasks.map((task) => {
    const taskFinish = new Date(task.estimatedFinish);
    const totalMinutes = Math.max(1, differenceInMinutes(taskFinish, createdAt));
    const elapsedMinutes = clamp(differenceInMinutes(now, createdAt), 0, totalMinutes);
    const progress = order.status === "Completed" ? 100 : order.status === "Pending Approval" ? 0 : clamp(Math.round((elapsedMinutes / totalMinutes) * 100), 0, 99);
    const plannedPercent = (averagePlannedShare / order.quantity) * 100;
    const actualPercent = (task.assignedQty / order.quantity) * 100;
    return {
      ...task,
      progress,
      variance: Math.round((actualPercent - plannedPercent) * 10) / 10,
      isDelayed: new Date(task.estimatedFinish) > deadline,
    };
  });

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
          <div className="flex flex-col items-end gap-2">
            <Badge variant={order.status === "Pending Approval" ? "warn" : order.status === "Rejected" ? "gray" : order.status === "At Risk" ? "risk" : "safe"} className="text-sm px-3 py-1">
              {order.status}
            </Badge>
            <Badge variant={schedule.slaStatus === "SAFE" ? "safe" : "risk"} className="text-sm px-3 py-1">
              SLA {schedule.slaStatus}
            </Badge>
          </div>
        </div>

        {order.status === "Pending Approval" && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Pending Approval</p>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">Review the schedule before releasing this order to production.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onApprovalDecision(order.id, "Rejected")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-gray-900 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => onApprovalDecision(order.id, "In Progress")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </button>
              </div>
            </div>
          </div>
        )}

        {delayMinutes > 0 && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>This schedule is projected to finish {delayMinutes} min after the deadline.</span>
            </div>
          </div>
        )}

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

      {/* Execution tracking */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-800">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Execution tracking</h3>
            <p className="mt-0.5 text-xs text-gray-500">Progress per task, variance vs planned split, and delay alerts.</p>
          </div>
          <Badge variant={delayMinutes > 0 ? "risk" : "safe"}>{delayMinutes > 0 ? "Delay Alert" : "On Plan"}</Badge>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {executionRows.map((task, i) => (
            <div key={task.machineId} className="grid gap-3 px-5 py-4 md:grid-cols-[110px_1fr_130px_150px] md:items-center">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{task.machineId}</p>
                <p className="text-xs text-gray-500">{task.assignedQty.toLocaleString()} jobs</p>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{task.progress}% complete</span>
                  <span>Finish {format(new Date(task.estimatedFinish), "h:mm a")}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${task.progress}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                  />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Variance vs plan</p>
                <p className={`text-sm font-semibold ${Math.abs(task.variance) > 10 ? "text-amber-600" : "text-gray-900 dark:text-gray-100"}`}>
                  {task.variance > 0 ? "+" : ""}{task.variance}%
                </p>
              </div>
              <div className="flex justify-start md:justify-end">
                <Badge variant={task.isDelayed ? "risk" : "safe"}>
                  {task.isDelayed ? "Delayed" : "On time"}
                </Badge>
              </div>
            </div>
          ))}
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
