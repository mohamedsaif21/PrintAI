"use client";
import React, { useEffect, useState } from "react";
import { Order, ScheduleResult, Machine } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { format, differenceInDays, isValid } from "date-fns";
import { Cpu, CalendarDays } from "lucide-react";
import { clampProgress, safeDivide, toTimestamp } from "@/lib/safeMath";

interface JobStatusPanelProps {
  order: Order;
  schedule: ScheduleResult | null;
  machines: Machine[];
}

export function JobStatusPanel({ order, schedule, machines }: JobStatusPanelProps) {
  const [now, setNow] = useState(new Date());
  const safeMachines = machines ?? [];

  const formatSafeDate = (value: string | undefined, pattern: string, fallback = "TBD") => {
    if (!value) return fallback;
    const date = new Date(value);
    return isValid(date) ? format(date, pattern) : fallback;
  };

  // Auto-refresh the current time so the progress bar and time limits update smoothly
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 5000);
    return () => clearInterval(timer);
  }, []);

  // 1. Progress Calculation (Deterministic — prefers live machine queue when available)
  const getProgress = () => {
    if (order.status === "Completed") {
      const total = Math.max(0, order.quantity);
      return { percent: 100, completedSheets: total, totalSheets: total };
    }
    if (order.status === "Pending Approval" || order.status === "Pending" || order.status === "Rejected") {
      return { percent: 0, completedSheets: 0, totalSheets: order.quantity };
    }

    const queueJobs = safeMachines.flatMap((m) => (m.queue ?? []).filter((j) => j.orderId === order.id));
    if (!schedule && queueJobs.length === 0) {
      return { percent: 0, completedSheets: 0, totalSheets: Math.max(0, order.quantity) };
    }

    let completedSheets = 0;
    const currentMs = now.getTime();
    const createdAt = toTimestamp(order.createdAt) ?? currentMs;

    const workItems = schedule
      ? schedule.tasks.map((task) => ({
          task,
          queueJob: safeMachines.find((m) => m.id === task.machineId)?.queue?.find((j) => j.orderId === order.id),
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
        completedSheets += Math.max(0, queueJob.assignedQty);
        return;
      }

      if (queueJob?.status === "running") {
        const startMs = toTimestamp(queueJob.startedAt);
        const finishMs = toTimestamp(queueJob.realFinishAt);
        if (startMs === null || finishMs === null) return;
        const totalMs = Math.max(1, finishMs - startMs);
        const elapsedMs = Math.max(0, Math.min(currentMs - startMs, totalMs));
        completedSheets += Math.round(queueJob.assignedQty * safeDivide(elapsedMs, totalMs, 0));
        return;
      }

      const finishMs = toTimestamp(task.estimatedFinish);
      if (finishMs === null) return;
      const totalMs = Math.max(1, finishMs - createdAt);
      const elapsedMs = Math.max(0, Math.min(currentMs - createdAt, totalMs));
      completedSheets += Math.round(task.assignedQty * safeDivide(elapsedMs, totalMs, 0));
    });

    const clamped = clampProgress(completedSheets, order.quantity);
    return { percent: clamped.percent, completedSheets: clamped.completed, totalSheets: clamped.total };
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
    const queueJobs = safeMachines.flatMap((m) => (m.queue ?? []).filter((j) => j.orderId === order.id));
    const queueFinishMs = queueJobs
      .map((j) => toTimestamp(j.realFinishAt))
      .filter((ms): ms is number => ms !== null);
    const finishMs = schedule?.overallFinish
      ? toTimestamp(schedule.overallFinish)
      : queueFinishMs.length > 0
        ? Math.max(...queueFinishMs)
        : null;

    if (finishMs === null) return { level: "SAFE", label: "SAFE (Unscheduled)" };

    const deadlineMs = toTimestamp(order.deadline);
    if (deadlineMs === null) return { level: "SAFE", label: "SAFE (No deadline)" };

    const delayMs = finishMs - deadlineMs;

    if (delayMs <= 0) return { level: "SAFE", label: "SAFE" };
    const startMs = toTimestamp(order.createdAt) ?? deadlineMs;
    const totalAllowedMs = Math.max(1, deadlineMs - startMs);
    if (delayMs > 0 && delayMs < totalAllowedMs * 0.2) return { level: "MEDIUM", label: "MEDIUM RISK" };
    return { level: "HIGH", label: "HIGH RISK" };
  };

  const risk = getRiskStatus();

  // 3. Time Remaining Formatting
  const formatTimeRemaining = () => {
    if (order.status === "Completed") return "Completed";

    const deadlineMs = toTimestamp(order.deadline);
    if (deadlineMs === null) return "Unknown";

    const diffMinutes = Math.round((deadlineMs - now.getTime()) / 60_000);

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

  const ageDays = Math.max(0, differenceInDays(now, new Date(toTimestamp(order.createdAt) ?? now.getTime())));

  const assignedMachines = schedule
    ? safeMachines.filter((m) => schedule.tasks.some((t) => t.machineId === m.id))
    : safeMachines.filter((m) => (m.queue ?? []).some((j) => j.orderId === order.id && j.status !== "completed"));

  return (
    <div className="flex flex-col space-y-6 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
      {/* --- Job Identity Section --- */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-lg font-bold text-gray-900">WO: {order.id}</h2>
          <p className="text-sm text-gray-500">{order.customer}</p>
          <p className="text-sm font-medium text-gray-700 mt-1">
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
            <span className="text-3xl font-bold text-gray-900">{progress.percent}%</span>
            <span className="text-sm text-gray-500 ml-2">
              ({progress.completedSheets.toLocaleString()} / {progress.totalSheets.toLocaleString()} sheets)
            </span>
          </div>
          <div className="text-sm font-bold text-blue-600 uppercase tracking-wider">
            {activeStage}
          </div>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-2 overflow-hidden border border-gray-200">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${order.status === "Completed" ? "bg-emerald-600" : "bg-blue-600"}`}
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        {/* Stage Indicator Line */}
        <div className="flex justify-between text-xs font-semibold px-1 text-gray-400">
          <span className={activeStage === "Pre-Press" ? "text-blue-600" : (order.status !== "Pending" ? "text-gray-800" : "")}>Pre-Press</span>
          <span className={activeStage === "Press" ? "text-blue-600" : (order.status === "Completed" ? "text-gray-800" : "")}>Press</span>
          <span className={activeStage === "Post-Press" ? "text-blue-600" : ""}>Post-Press</span>
        </div>
      </div>

      <hr className="border-gray-200" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* --- Machine Assignment Section --- */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-gray-500" /> Machine Assignment
          </h3>
          {assignedMachines.length > 0 ? (
            <div className="space-y-3">
              {assignedMachines.map(m => {
                const otherJobs = (m.queue || []).filter(j => j.orderId !== order.id && (j.status === "queued" || j.status === "paused"));

                return (
                  <div key={m.id} className="flex flex-col p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-gray-900">{m.id}</p>
                        <p className="text-xs text-gray-500">Speed: {m.speed.toLocaleString()} / hr</p>
                      </div>
                      <Badge variant={(m.status ?? "available") === "busy" ? "safe" : m.status === "breakdown" ? "risk" : "gray"}>
                        {(m.status ?? "unknown").toUpperCase()}
                      </Badge>
                    </div>
                    {otherJobs.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Machine Queue Details</p>
                        <div className="space-y-2">
                          {otherJobs.map((j, idx) => {
                            const isPaused = j.status === "paused";
                            const pct = isPaused && j.totalEstimatedHours > 0
                              ? Math.round((1 - j.estimatedHours / j.totalEstimatedHours) * 100)
                              : 0;
                            return (
                              <div key={`${j.jobId}-${idx}`} className="flex justify-between items-start text-xs">
                                <div className="flex flex-col">
                                  <span className="text-gray-700 font-medium">Order {j.orderId}</span>
                                  <span className="text-gray-500">{j.assignedQty.toLocaleString()} sheets</span>
                                </div>
                                <div className="flex flex-col items-end">
                                  <span className={`font-medium ${isPaused ? 'text-amber-700' : 'text-blue-600'}`}>
                                    {isPaused ? 'Paused' : 'Queued'}
                                  </span>
                                  {isPaused && pct > 0 && (
                                    <span className="text-[10px] text-amber-700">({pct}% done)</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500 flex items-center justify-center italic">
              Unassigned / Standby
            </div>
          )}
        </div>

        {/* --- Time & SLA Risk Section --- */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-500" /> Time & SLA Risk
          </h3>
          <div className="bg-gray-50 p-4 border border-gray-200 rounded-lg space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Start Date:</span>
              <span className="font-medium text-gray-900">{formatSafeDate(order.createdAt, "MMM d, h:mm a")}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estimated Finish:</span>
              <span className="font-medium text-gray-900">
                {schedule?.overallFinish
                  ? formatSafeDate(schedule.overallFinish, "MMM d, h:mm a")
                  : (() => {
                      const finishes = safeMachines
                        .flatMap((m) => (m.queue ?? []).filter((j) => j.orderId === order.id))
                        .map((j) => toTimestamp(j.realFinishAt))
                        .filter((ms): ms is number => ms !== null);
                      return finishes.length > 0
                        ? formatSafeDate(new Date(Math.max(...finishes)).toISOString(), "MMM d, h:mm a")
                        : "TBD";
                    })()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">SLA Deadline:</span>
              <span className="font-medium text-gray-900">{formatSafeDate(order.deadline, "MMM d, h:mm a")}</span>
            </div>

            <div className="border-t border-gray-200 my-2" />

            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ageing:</span>
              <span className="font-medium text-gray-900">{ageDays} days</span>
            </div>
            <div className="flex justify-between text-sm items-center">
              <span className="text-gray-500">Time Remaining:</span>
              <span className={`font-bold ${formatTimeRemaining().includes("Overdue") ? "text-red-600" : "text-gray-900"}`}>
                {formatTimeRemaining()}
              </span>
            </div>

            <div className="pt-2 mt-2 border-t border-gray-200 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Risk Assessment:</span>
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