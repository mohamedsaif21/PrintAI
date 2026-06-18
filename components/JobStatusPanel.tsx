"use client";
import React, { useEffect, useState } from "react";
import { Order, ScheduleResult, Machine } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format, differenceInMinutes, differenceInDays } from "date-fns";
import { Cpu, CalendarDays } from "lucide-react";

interface JobStatusPanelProps {
  order: Order;
  schedule: ScheduleResult | null;
  machines: Machine[];
}

export function JobStatusPanel({ order, schedule, machines }: JobStatusPanelProps) {
  const [now, setNow] = useState(new Date());

  // Auto-refresh the current time so the progress bar and time limits update smoothly
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  // 1. Progress Calculation (Deterministic — prefers live machine queue when available)
  const getProgress = () => {
    if (order.status === "Completed") {
      return { percent: 100, completedSheets: order.quantity, totalSheets: order.quantity };
    }
    if (order.status === "Pending Approval" || order.status === "Pending" || order.status === "Rejected") {
      return { percent: 0, completedSheets: 0, totalSheets: order.quantity };
    }

    const queueJobs = machines.flatMap((m) => m.queue.filter((j) => j.orderId === order.id));
    if (!schedule && queueJobs.length === 0) {
      return { percent: 0, completedSheets: 0, totalSheets: order.quantity };
    }

    let completedSheets = 0;
    const currentMs = now.getTime();
    const createdAt = new Date(order.createdAt).getTime();

    const workItems = schedule
      ? schedule.tasks.map((task) => ({
          task,
          queueJob: machines.find((m) => m.id === task.machineId)?.queue.find((j) => j.orderId === order.id),
        }))
      : queueJobs.map((queueJob) => ({
          task: {
            machineId: queueJob.machineId,
            assignedQty: queueJob.assignedQty,
            estimatedFinish: queueJob.realFinishAt,
          },
          queueJob,
        }));

    workItems.forEach(({ task, queueJob }) => {

      if (queueJob?.status === "completed") {
        completedSheets += queueJob.assignedQty;
        return;
      }

      if (queueJob?.status === "running") {
        const startMs = new Date(queueJob.startedAt).getTime();
        const finishMs = new Date(queueJob.realFinishAt).getTime();
        const totalMs = Math.max(1, finishMs - startMs);
        const elapsedMs = Math.max(0, Math.min(currentMs - startMs, totalMs));
        completedSheets += Math.round(queueJob.assignedQty * (elapsedMs / totalMs));
        return;
      }

      const finishMs = new Date(task.estimatedFinish).getTime();
      const totalMs = Math.max(1, finishMs - createdAt);
      const elapsedMs = Math.max(0, Math.min(currentMs - createdAt, totalMs));
      completedSheets += Math.round(task.assignedQty * (elapsedMs / totalMs));
    });

    const percent = Math.min(100, Math.round((completedSheets / order.quantity) * 100));
    return { percent, completedSheets, totalSheets: order.quantity };
  };

  const progress = getProgress();

  // Active Stage Determinism
  const activeStage =
    order.status === "Completed"
      ? "Post-Press"
      : order.status === "Pending Approval" || order.status === "Pending" || order.status === "Rejected"
        ? "Pre-Press"
        : "Press";

  // 2. Risk Calculation (Strict Logic, independent of AI)
  const getRiskStatus = () => {
    const queueJobs = machines.flatMap((m) => m.queue.filter((j) => j.orderId === order.id));
    const finishMs = schedule
      ? new Date(schedule.overallFinish).getTime()
      : queueJobs.length > 0
        ? Math.max(...queueJobs.map((j) => new Date(j.realFinishAt).getTime()))
        : null;

    if (finishMs === null) return { level: "SAFE", label: "SAFE (Unscheduled)" };

    const startMs = new Date(order.createdAt).getTime();
    const deadlineMs = new Date(order.deadline).getTime();
    const delayMs = finishMs - deadlineMs;

    if (delayMs <= 0) return { level: "SAFE", label: "SAFE" };
    const totalAllowedMs = deadlineMs - startMs;
    if (delayMs > 0 && delayMs < totalAllowedMs * 0.2) return { level: "MEDIUM", label: "MEDIUM RISK" };
    return { level: "HIGH", label: "HIGH RISK" };
  };

  const risk = getRiskStatus();

  // 3. Time Remaining Formatting
  const formatTimeRemaining = () => {
    if (order.status === "Completed") return `Completed`;
    
    const target = new Date(order.deadline);
    const diffMinutes = differenceInMinutes(target, now);

    if (diffMinutes < 0) {
      const overdueHours = Math.floor(Math.abs(diffMinutes) / 60);
      const overdueMins = Math.abs(diffMinutes) % 60;
      return `Overdue by ${overdueHours}h ${overdueMins}m`;
    }

    const days = Math.floor(diffMinutes / (60 * 24));
    const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
    const mins = diffMinutes % 60;

    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h ${mins}m left`;
  };

  const ageDays = differenceInDays(now, new Date(order.createdAt));

  // 4. Extract active assigned machines
  const assignedMachines = schedule
    ? machines.filter((m) => schedule.tasks.some((t) => t.machineId === m.id))
    : machines.filter((m) => m.queue.some((j) => j.orderId === order.id && j.status !== "completed"));

  return (
    <div className="flex flex-col space-y-6 bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
      {/* --- Job Identity Section --- */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">WO: {order.id}</h2>
          <p className="text-sm text-gray-500">{order.customer}</p>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">
            {order.product} · {order.paperType}
          </p>
        </div>
        <Badge variant={order.priority === "High" ? "risk" : order.priority === "Medium" ? "warn" : "safe"}>
          {order.priority} Priority
        </Badge>
      </div>

      {/* --- Progress Section --- */}
      <div>
        <div className="flex justify-between items-end mb-2">
          <div>
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">{progress.percent}%</span>
            <span className="text-sm text-gray-500 ml-2">
              ({progress.completedSheets.toLocaleString()} / {progress.totalSheets.toLocaleString()} sheets)
            </span>
          </div>
          <div className="text-sm font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            {activeStage}
          </div>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 mb-2 overflow-hidden border border-gray-200 dark:border-gray-700">
          <div 
            className={`h-3 rounded-full transition-all duration-500 ${order.status === "Completed" ? "bg-emerald-500" : "bg-blue-600"}`} 
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        {/* Stage Indicator Line */}
        <div className="flex justify-between text-xs font-semibold px-1 text-gray-400">
          <span className={activeStage === "Pre-Press" ? "text-blue-600 dark:text-blue-400" : (order.status !== "Pending" ? "text-gray-800 dark:text-gray-200" : "")}>Pre-Press</span>
          <span className={activeStage === "Press" ? "text-blue-600 dark:text-blue-400" : (order.status === "Completed" ? "text-gray-800 dark:text-gray-200" : "")}>Press</span>
          <span className={activeStage === "Post-Press" ? "text-blue-600 dark:text-blue-400" : ""}>Post-Press</span>
        </div>
      </div>

      <hr className="border-gray-100 dark:border-gray-800" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* --- Machine Assignment Section --- */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-gray-500" /> Machine Assignment
          </h3>
          {assignedMachines.length > 0 ? (
            <div className="space-y-3">
              {assignedMachines.map(m => (
                <div key={m.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-lg">
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{m.id}</p>
                    <p className="text-xs text-gray-500">Speed: {m.speed.toLocaleString()} / hr</p>
                  </div>
                  <Badge variant={m.status === "busy" ? "safe" : m.status === "breakdown" ? "risk" : "gray"}>
                    {m.status.toUpperCase()}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-lg text-sm text-gray-500 flex items-center justify-center italic">
              Unassigned / Standby
            </div>
          )}
        </div>

        {/* --- Time & SLA Risk Section --- */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-500" /> Time & SLA Risk
          </h3>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-4 border border-gray-100 dark:border-gray-800 rounded-lg space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Start Date:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{format(new Date(order.createdAt), "MMM d, h:mm a")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estimated Finish:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {schedule
                  ? format(new Date(schedule.overallFinish), "MMM d, h:mm a")
                  : (() => {
                      const finishes = machines
                        .flatMap((m) => m.queue.filter((j) => j.orderId === order.id))
                        .map((j) => new Date(j.realFinishAt).getTime());
                      return finishes.length > 0
                        ? format(new Date(Math.max(...finishes)), "MMM d, h:mm a")
                        : "TBD";
                    })()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">SLA Deadline:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{format(new Date(order.deadline), "MMM d, h:mm a")}</span>
            </div>
            
            <div className="border-t border-gray-200 dark:border-gray-700 my-2" />
            
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ageing:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">{ageDays} days</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-500">Time Remaining:</span>
              <span className={`font-bold ${formatTimeRemaining().includes("Overdue") ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}`}>
                {formatTimeRemaining()}
              </span>
            </div>
            
            <div className="pt-2 mt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Risk Assessment:</span>
              <Badge variant={risk.level === "HIGH" ? "risk" : risk.level === "MEDIUM" ? "warn" : "safe"}>
                {risk.label}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}