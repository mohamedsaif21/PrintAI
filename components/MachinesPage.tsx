"use client";

import { useEffect, useState } from "react";
import { Machine, Order, ScheduleResult, ScheduledTask } from "@/types";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  ChevronRight,
  Cpu,
  Loader2,
  RefreshCw,
  Search,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { JobStatusPanel } from "@/components/JobStatusPanel";
import { resolveActiveJobForMachine } from "@/lib/scheduler";

interface Props {
  machines: Machine[];
  orders: Order[];
  lastSchedule: ScheduleResult | null;
  onFailure: (result: {
    newTasks: ScheduledTask[];
    result: ScheduleResult;
    failedMachineId: string;
    backupMachineId: string;
    remainingQty: number;
  }) => void;
  onReset: () => void;
}

type Extra = {
  name: string;
  type: string;
  location: string;
  operatorName: string;
  supervisorName: string;
  description: string;
  nextMaintenance: string;
  idleTime: string;
  woNo: string;
  slaDeadline: string;
  startDate: string;
  edd: string;
  runtimeSegments: { color: string; pct: number; label: string }[];
  downtimeLogs: {
    date: string;
    start: string;
    duration: string;
    reason: string;
    action: string;
    loggedBy: string;
    impact: string;
  }[];
  jobHistory: { date: string; job: string; qty: number; status: string }[];
  aiSuggestions: string[];
};

const MACHINE_EXTRA: Record<string, Extra> = {
  M1: {
    name: "HP Indigo 7900 (M1)",
    type: "Production",
    location: "Offset",
    operatorName: "Arjun A.",
    supervisorName: "Printing",
    description: "Printing",
    nextMaintenance: "July 15, 2025",
    idleTime: "15 mins",
    woNo: "FO 1197601",
    slaDeadline: "7/7/2025",
    startDate: "5/7/2025",
    edd: "6/7/2025",
    runtimeSegments: [
      { color: "#22c55e", pct: 35, label: "Operating Normally" },
      { color: "#ef4444", pct: 18, label: "Stopped Unexpectedly" },
      { color: "#22c55e", pct: 20, label: "Operating Normally" },
      { color: "#a855f7", pct: 10, label: "Planned Stop" },
      { color: "#22c55e", pct: 10, label: "Operating Normally" },
      { color: "#3b82f6", pct: 4, label: "Idle" },
      { color: "#d1d5db", pct: 3, label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/3/2025", start: "10:00 am", duration: "45 min", reason: "Scheduled maintenance", action: "Part Changed", loggedBy: "Madhur", impact: "OF 123456" },
      { date: "7/4/2025", start: "2:30 pm", duration: "1 hr", reason: "Paper jam", action: "Cleared jam", loggedBy: "Arjun", impact: "OF 123460" },
      { date: "7/5/2025", start: "11:00 am", duration: "30 min", reason: "Ink refill", action: "Ink replaced", loggedBy: "Madhur", impact: "None" },
    ],
    jobHistory: [
      { date: "7/1/2025", job: "Brochures - PrintCo", qty: 5000, status: "Completed" },
      { date: "7/3/2025", job: "Flyers - Bright Media", qty: 3000, status: "Completed" },
      { date: "7/5/2025", job: "Catalogue - Acme", qty: 2000, status: "In Progress" },
    ],
    aiSuggestions: [
      "Schedule preventive maintenance before July 20 to avoid unplanned downtime.",
      "Utilisation at 62% - consider assigning overflow from M2 during peak hours.",
      "3 unscheduled breakdowns this month. Recommend ink system inspection.",
    ],
  },
  M2: {
    name: "SM-52 Heidelberg (M2)",
    type: "Offset",
    location: "Offset",
    operatorName: "Rahul K.",
    supervisorName: "Printing",
    description: "Printing",
    nextMaintenance: "July 12, 2025",
    idleTime: "3 hrs",
    woNo: "FO 1197602",
    slaDeadline: "7/8/2025",
    startDate: "5/7/2025",
    edd: "6/7/2025",
    runtimeSegments: [
      { color: "#f59e0b", pct: 60, label: "Operating Normally" },
      { color: "#a855f7", pct: 20, label: "Planned Stop" },
      { color: "#d1d5db", pct: 20, label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/2/2025", start: "9:00 am", duration: "2 hrs", reason: "Roller change", action: "Roller replaced", loggedBy: "Rahul", impact: "OF 123455" },
    ],
    jobHistory: [{ date: "7/4/2025", job: "Annual Report - Vega", qty: 1500, status: "In Progress" }],
    aiSuggestions: ["Machine underutilised at 42%. Consider reassigning jobs from overloaded machines."],
  },
  M3: {
    name: "SX-52 4C+ Coating (M3)",
    type: "Production",
    location: "Offset",
    operatorName: "Priya S.",
    supervisorName: "Printing",
    description: "Printing",
    nextMaintenance: "July 18, 2025",
    idleTime: "0 mins",
    woNo: "FO 1197603",
    slaDeadline: "7/7/2025",
    startDate: "5/7/2025",
    edd: "6/7/2025",
    runtimeSegments: [
      { color: "#22c55e", pct: 55, label: "Operating Normally" },
      { color: "#ef4444", pct: 10, label: "Stopped Unexpectedly" },
      { color: "#22c55e", pct: 30, label: "Operating Normally" },
      { color: "#d1d5db", pct: 5, label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/5/2025", start: "3:00 pm", duration: "30 min", reason: "Coating unit jam", action: "Cleared", loggedBy: "Priya", impact: "OF 123470" },
    ],
    jobHistory: [
      { date: "7/2/2025", job: "Posters - Bright Media", qty: 4000, status: "Completed" },
      { date: "7/6/2025", job: "Brochures - PrintCo", qty: 4000, status: "In Progress" },
    ],
    aiSuggestions: [
      "Running at 103% utilisation - redistribute 1,000 sheets to M4 to avoid overload.",
      "Coating unit flagged for inspection after today's jam event.",
    ],
  },
  M4: {
    name: "Auto Die Cutting (M4)",
    type: "Post Production",
    location: "Offset",
    operatorName: "Kiran M.",
    supervisorName: "Printing",
    description: "Printing",
    nextMaintenance: "July 12, 2025",
    idleTime: "3 hrs",
    woNo: "FO 1197604",
    slaDeadline: "7/7/2025",
    startDate: "5/7/2025",
    edd: "6/7/2025",
    runtimeSegments: [
      { color: "#22c55e", pct: 40, label: "Operating Normally" },
      { color: "#a855f7", pct: 15, label: "Planned Stop" },
      { color: "#22c55e", pct: 25, label: "Operating Normally" },
      { color: "#3b82f6", pct: 10, label: "Idle" },
      { color: "#d1d5db", pct: 10, label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/3/2025", start: "11:00 am", duration: "1 hr 7 min", reason: "Blade replacement", action: "Blade changed", loggedBy: "Kiran", impact: "OF 123456" },
      { date: "7/6/2025", start: "10:30 am", duration: "1 hr", reason: "Unscheduled stop", action: "Sensor reset", loggedBy: "Kiran", impact: "OF 123480" },
    ],
    jobHistory: [
      { date: "7/1/2025", job: "Flyers - Acme", qty: 3000, status: "Completed" },
      { date: "7/5/2025", job: "Catalogue - Vega Corp", qty: 3000, status: "In Progress" },
    ],
    aiSuggestions: [
      "Total downtime 6 hr 45 min this week - above threshold. Schedule full inspection.",
      "Idle time 3 hrs - can absorb 2,000 sheets from M3 overload.",
    ],
  },
  M5: {
    name: "UV Machine Nano (M5)",
    type: "Offset",
    location: "Offset",
    operatorName: "Suresh P.",
    supervisorName: "Printing",
    description: "Backup / UV Coating",
    nextMaintenance: "July 22, 2025",
    idleTime: "5 hrs",
    woNo: "-",
    slaDeadline: "-",
    startDate: "-",
    edd: "-",
    runtimeSegments: [
      { color: "#d1d5db", pct: 70, label: "Idle" },
      { color: "#22c55e", pct: 20, label: "Operating Normally" },
      { color: "#d1d5db", pct: 10, label: "Idle" },
    ],
    downtimeLogs: [],
    jobHistory: [],
    aiSuggestions: ["Machine on standby. Ready to absorb emergency overflow within 5 minutes."],
  },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  available: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Available" },
  busy: { bg: "bg-amber-100", text: "text-amber-800", label: "Busy" },
  backup: { bg: "bg-gray-100", text: "text-gray-600", label: "Standby" },
  breakdown: { bg: "bg-red-100", text: "text-red-800", label: "Breakdown" },
};

const STATUS_CONFIG: Record<string, { dot: string; badge: "safe" | "warn" | "gray" | "risk"; label: string }> = {
  available: { dot: "bg-emerald-500", badge: "safe", label: "Available" },
  busy: { dot: "bg-amber-500", badge: "warn", label: "Busy" },
  backup: { dot: "bg-gray-400", badge: "gray", label: "Standby" },
  breakdown: { dot: "bg-red-500", badge: "risk", label: "Breakdown" },
};

const DETAIL_TABS = ["Machine Details", "Job History", "Downtime & Maintenance Logs", "AI Suggestions"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function LiveJobProgress({ machine }: { machine: Machine }) {
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const job = machine.queue?.[0];
  if (!job || job.status !== "running") {
    return (
      <div className="space-y-1">
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${machine.status === "available" ? "bg-emerald-500" : machine.status === "busy" ? "bg-amber-500" : machine.status === "breakdown" ? "bg-red-500" : "bg-gray-400"}`}
            style={{ width: `${Math.min(machine.utilisation, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400">{machine.utilisation}% utilised</p>
      </div>
    );
  }

  const startMs = new Date(job.startedAt).getTime();
  const finishMs = new Date(job.realFinishAt).getTime();
  const clockMs = nowMs || startMs;
  const progress = clockMs >= finishMs ? 100 : clockMs <= startMs ? 0 : Math.round(((clockMs - startMs) / (finishMs - startMs)) * 100);
  const remainingSeconds = Math.ceil(Math.max(0, finishMs - clockMs) / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div className="space-y-1">
      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-gray-400 tabular-nums">
        {progress}% - {minutes}:{seconds.toString().padStart(2, "0")} left
      </p>
    </div>
  );
}

function MachineDetail({
  machine,
  machines,
  orders,
  lastSchedule,
  onBack,
}: {
  machine: Machine;
  machines: Machine[];
  orders: Order[];
  lastSchedule: ScheduleResult | null;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("Machine Details");
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);
  
  const extra = MACHINE_EXTRA[machine.id] || MACHINE_EXTRA.M4;
  const statusStyle = STATUS_STYLES[machine.status] || STATUS_STYLES.available;
  const activeTask = lastSchedule?.tasks.find((task) => task.machineId === machine.id);
  const isWorking = machine.status === "busy" && Boolean(activeTask);
  const jobProgress = isWorking ? machine.utilisation : machine.status === "available" ? 0 : Math.min(100, machine.utilisation);
  const activeJob = resolveActiveJobForMachine(machine, orders, lastSchedule, machines);

  const shiftEndTime = currentTime;
  const shiftStartTime = new Date(currentTime.getTime() - 5 * 60 * 60 * 1000);
  const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  // Build dynamic job history from machine queue and past static data
  const dynamicJobHistory = [
    ...machine.queue
      .filter((job) => job.status === "running" || job.status === "completed")
      .map((job) => ({
        date: new Date(job.startedAt).toLocaleDateString(),
        job: `Order ${job.orderId}`,
        qty: job.assignedQty,
        status: job.status === "completed" ? "Completed" : "In Progress",
      })),
    ...extra.jobHistory.filter(
      (staticJob) => 
        !machine.queue.some(
          (qJob) => 
            staticJob.job.includes(qJob.orderId) && 
            staticJob.status === (qJob.status === "completed" ? "Completed" : "In Progress")
        )
    ),
  ];
  
  // Merge machine's persistent downtime logs with static fallback data
  const dynamicDowntimeLogs = [
    ...(machine.downtimeLogs || []),
    ...extra.downtimeLogs.filter(
      (staticLog) => 
        !(machine.downtimeLogs || []).some(
          (persistedLog) => 
            persistedLog.date === staticLog.date && 
            persistedLog.start === staticLog.start
        )
    ),
  ];
  
  // Build dynamic runtime segments based on actual machine state history
  const buildRuntimeSegments = () => {
    const shiftStart = machine.shiftStartTime ? new Date(machine.shiftStartTime) : shiftStartTime;
    const shiftEnd = currentTime;
    const shiftDurationMs = shiftEnd.getTime() - shiftStart.getTime();
    
    // If no state history or too short, show current state
    if (!machine.stateHistory || machine.stateHistory.length === 0 || shiftDurationMs < 60000) {
      const runningJob = machine.queue.find((job) => job.status === "running");
      
      if (machine.status === "breakdown") {
        return [{ color: "#ef4444", pct: 100, label: "Stopped Unexpectedly" }];
      }
      if (machine.status === "backup") {
        return [{ color: "#d1d5db", pct: 100, label: "Idle - Backup Standby" }];
      }
      if (machine.status === "available" && machine.queue.length === 0) {
        return [{ color: "#3b82f6", pct: 100, label: "Idle" }];
      }
      if (machine.status === "busy" && runningJob) {
        const startMs = new Date(runningJob.startedAt).getTime();
        const finishMs = new Date(runningJob.realFinishAt).getTime();
        const nowMs = Date.now();
        const totalDuration = finishMs - startMs;
        const elapsed = Math.max(0, nowMs - startMs);
        const progress = Math.min(100, (elapsed / totalDuration) * 100);
        
        return [
          { color: "#22c55e", pct: Math.round(progress), label: "Operating Normally" },
          { color: "#d1d5db", pct: Math.round(100 - progress), label: "Remaining Time" },
        ].filter((s) => s.pct > 0);
      }
      return [{ color: "#3b82f6", pct: 100, label: "Idle" }];
    }
    
    // Build segments from state history
    const segments: { color: string; pct: number; label: string; startMs: number; endMs: number }[] = [];
    const history = [...machine.stateHistory].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Start with initial state at shift start
    let lastTimestamp = shiftStart.getTime();
    
    history.forEach((log, index) => {
      const logTime = new Date(log.timestamp).getTime();
      
      // Don't process logs before shift start
      if (logTime < shiftStart.getTime()) return;
      
      const durationMs = logTime - lastTimestamp;
      if (durationMs > 0) {
        // Add segment for the previous state
        const prevLog = index > 0 ? history[index - 1] : null;
        const prevStatus = prevLog?.status || "available";
        
        let color = "#3b82f6"; // Idle
        let label = "Idle";
        
        if (prevStatus === "busy") {
          color = "#22c55e";
          label = prevLog?.orderId ? `Running ${prevLog.orderId}` : "Operating Normally";
        } else if (prevStatus === "breakdown") {
          color = "#ef4444";
          label = "Stopped Unexpectedly";
        } else if (prevStatus === "backup") {
          color = "#d1d5db";
          label = "Standby";
        }
        
        segments.push({
          color,
          pct: 0,
          label,
          startMs: lastTimestamp,
          endMs: logTime,
        });
      }
      
      lastTimestamp = logTime;
    });
    
    // Add current state from last log to now
    const currentMs = shiftEnd.getTime();
    if (currentMs > lastTimestamp) {
      const lastLog = history[history.length - 1];
      const currentStatus = lastLog?.status || machine.status;
      
      let color = "#3b82f6";
      let label = "Idle";
      
      if (currentStatus === "busy") {
        const runningJob = machine.queue.find((job) => job.status === "running");
        if (runningJob) {
          const jobStartMs = new Date(runningJob.startedAt).getTime();
          const jobFinishMs = new Date(runningJob.realFinishAt).getTime();
          const jobDuration = jobFinishMs - jobStartMs;
          const elapsed = Math.max(0, currentMs - jobStartMs);
          const progress = Math.min(1, elapsed / jobDuration);
          
          // Split busy period into completed and remaining
          const busyDuration = currentMs - lastTimestamp;
          const completedDuration = busyDuration * progress;
          const remainingDuration = busyDuration * (1 - progress);
          
          if (completedDuration > 0) {
            segments.push({
              color: "#22c55e",
              pct: 0,
              label: runningJob.orderId ? `Running ${runningJob.orderId}` : "Operating Normally",
              startMs: lastTimestamp,
              endMs: lastTimestamp + completedDuration,
            });
          }
          
          if (remainingDuration > 0) {
            segments.push({
              color: "#d1d5db",
              pct: 0,
              label: "Remaining Time",
              startMs: lastTimestamp + completedDuration,
              endMs: currentMs,
            });
          }
        } else {
          color = "#22c55e";
          label = lastLog?.orderId ? `Running ${lastLog.orderId}` : "Operating Normally";
          segments.push({ color, pct: 0, label, startMs: lastTimestamp, endMs: currentMs });
        }
      } else if (currentStatus === "breakdown") {
        segments.push({
          color: "#ef4444",
          pct: 0,
          label: "Stopped Unexpectedly",
          startMs: lastTimestamp,
          endMs: currentMs,
        });
      } else if (currentStatus === "backup") {
        segments.push({
          color: "#d1d5db",
          pct: 0,
          label: "Standby",
          startMs: lastTimestamp,
          endMs: currentMs,
        });
      } else {
        segments.push({
          color: "#3b82f6",
          pct: 0,
          label: "Idle",
          startMs: lastTimestamp,
          endMs: currentMs,
        });
      }
    }
    
    // Calculate percentages
    segments.forEach((seg) => {
      const duration = seg.endMs - seg.startMs;
      seg.pct = Math.max(1, Math.round((duration / shiftDurationMs) * 100));
    });
    
    // Normalize to 100%
    const totalPct = segments.reduce((sum, seg) => sum + seg.pct, 0);
    if (totalPct !== 100 && segments.length > 0) {
      const diff = 100 - totalPct;
      segments[segments.length - 1].pct += diff;
    }
    
    return segments.filter((s) => s.pct > 0).map(({ color, pct, label }) => ({ color, pct, label }));
  };
  
  const dynamicRuntimeSegments = buildRuntimeSegments();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={onBack} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Machines
        </button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-900 dark:text-gray-100 font-medium">{extra.name}</span>
      </div>

      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{extra.name}</h2>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{extra.name}</h3>
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
              {statusStyle.label}
            </span>
          </div>
          <div className="flex gap-6">
            <div className="w-28 h-28 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-12 h-12 text-gray-400" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm flex-1">
              {[
                ["Machine ID", machine.id],
                ["Operator Name", extra.operatorName],
                ["Description", extra.description],
                ["Supervisor Name", extra.supervisorName],
                ["Next Maintenance Date", extra.nextMaintenance],
                ["Speed", `${machine.speed} sheets/hr`],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          </div>
      </div>

      {activeJob ? (
        <JobStatusPanel order={activeJob.order} schedule={activeJob.schedule} machines={machines} />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Job Status</h3>
          <span className="text-sm text-gray-500 font-medium">Standby / No active order</span>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Machine Runtime Overview</h3>
        <p className="text-xs text-gray-500 mb-3">
          Current Shift Duration: <span className="font-semibold text-gray-900 dark:text-gray-100">5 Hrs 00 Mins</span>
          {machine.status === "busy" && machine.queue[0] && (
            <span className="ml-3">
              Active Job: <span className="font-semibold text-emerald-600">Order {machine.queue[0].orderId}</span>
            </span>
          )}
        </p>
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {[
            { color: "#22c55e", label: "Operating Normally" },
            { color: "#ef4444", label: "Stopped Unexpectedly" },
            { color: "#a855f7", label: "Planned Stop" },
            { color: "#3b82f6", label: "Idle" },
            { color: "#d1d5db", label: "Remaining Time" },
          ].map((legend) => (
            <div key={legend.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: legend.color }} />
              <span className="text-xs text-gray-500">{legend.label}</span>
            </div>
          ))}
        </div>
        <div className="flex h-8 rounded-lg overflow-hidden w-full">
          {dynamicRuntimeSegments.map((segment, index) => (
            <div 
              key={index} 
              title={`${segment.label} (${segment.pct}%)`} 
              style={{ width: `${segment.pct}%`, background: segment.color }} 
              className="transition-all duration-500"
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatTime(shiftStartTime)}</span>
          <span className="text-gray-600 dark:text-gray-300 font-medium">
            {machine.status === "busy" ? "In Progress" : 
             machine.status === "breakdown" ? "Breakdown" : 
             machine.status === "backup" ? "Standby" : "Idle"}
          </span>
          <span>{formatTime(shiftEndTime)}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-5 overflow-x-auto">
          {DETAIL_TABS.map((detailTab) => (
            <button
              key={detailTab}
              onClick={() => setTab(detailTab)}
              className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === detailTab ? "border-blue-600 text-blue-700 dark:text-blue-400 font-medium" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
            >
              {detailTab}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "Machine Details" && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Machine ID", machine.id],
                ["Type", extra.type],
                ["Location", extra.location],
                ["Capacity", `${machine.capacity.toLocaleString()} sheets/day`],
                ["Paper Types", machine.paperTypes.join(", ")],
                ["Idle Time", extra.idleTime],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{value}</p>
                </div>
              ))}
            </div>
          )}

          {tab === "Job History" && (
            dynamicJobHistory.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">No job history for this machine.</p>
              : <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <div className="grid grid-cols-4 text-xs font-medium text-gray-400 uppercase pb-2">
                    <span>Date</span><span>Job</span><span>Qty</span><span>Status</span>
                  </div>
                  {dynamicJobHistory.slice(0, 10).map((job, index) => (
                    <div key={index} className="grid grid-cols-4 py-2.5 text-sm">
                      <span className="text-gray-500">{job.date}</span>
                      <span className="text-gray-800 dark:text-gray-200">{job.job}</span>
                      <span className="text-gray-600 dark:text-gray-400">{job.qty.toLocaleString()}</span>
                      <span className={`text-xs font-medium ${job.status === "Completed" ? "text-emerald-600" : "text-amber-600"}`}>{job.status}</span>
                    </div>
                  ))}
                  {machine.queue.filter((job) => job.status === "queued" || job.status === "paused").length > 0 && (
                    <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Upcoming & Paused Jobs</p>
                      {machine.queue.filter((job) => job.status === "queued" || job.status === "paused").map((job, index) => {
                        const isPaused = job.status === "paused";
                        const pct = job.totalEstimatedHours > 0 ? Math.round((1 - job.estimatedHours / job.totalEstimatedHours) * 100) : 0;
                        return (
                          <div key={`queued-${index}`} className="grid grid-cols-4 py-2 text-sm items-center">
                            <span className="text-gray-500">{isPaused ? "Paused" : "Pending"}</span>
                            <span className="text-gray-800 dark:text-gray-200">Order {job.orderId}</span>
                            <div className="flex flex-col">
                              <span className="text-gray-600 dark:text-gray-400">{job.assignedQty.toLocaleString()}</span>
                              {isPaused && pct > 0 && <span className="text-[10px] leading-tight text-amber-600">({pct}% done)</span>}
                            </div>
                            <span className={`text-xs font-medium ${isPaused ? "text-amber-600" : "text-blue-600"}`}>{isPaused ? "Preempted" : "Queued"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
          )}

          {tab === "Downtime & Maintenance Logs" && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
                {[
                  { 
                    label: "Total Downtime", 
                    value: machine.status === "breakdown" ? "Ongoing" : dynamicDowntimeLogs.length > 0 ? "6 hr 45 Mins" : "0 hr" 
                  },
                  { 
                    label: "Scheduled Maintenance events", 
                    value: dynamicDowntimeLogs.filter((log) => log.reason.toLowerCase().includes("maintenance") || log.reason.toLowerCase().includes("scheduled")).length.toString() 
                  },
                  { 
                    label: "Unscheduled Breakdowns", 
                    value: dynamicDowntimeLogs.filter((log) => !log.reason.toLowerCase().includes("maintenance") && !log.reason.toLowerCase().includes("scheduled")).length.toString() 
                  },
                  { 
                    label: "Average Downtime Per Event", 
                    value: dynamicDowntimeLogs.length > 0 ? "1 hr 7 min" : "N/A" 
                  },
                ].map((stat) => (
                  <div key={stat.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stat.value}</p>
                  </div>
                ))}
              </div>
              {dynamicDowntimeLogs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No downtime logs recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        {["Date", "Start Time", "Duration", "Reason", "Action Taken", "Logged By", "Job Impact"].map((heading) => (
                          <th key={heading} className="text-left text-xs font-medium text-gray-400 pb-2 pr-4">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {dynamicDowntimeLogs.map((log, index) => (
                        <tr key={index} className={log.duration === "Ongoing" ? "bg-red-50 dark:bg-red-900/10" : ""}>
                          <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{log.date}</td>
                          <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{log.start}</td>
                          <td className={`py-2.5 pr-4 whitespace-nowrap font-medium ${log.duration === "Ongoing" ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}`}>{log.duration}</td>
                          <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{log.reason}</td>
                          <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{log.action}</td>
                          <td className="py-2.5 pr-4 text-gray-500">{log.loggedBy}</td>
                          <td className="py-2.5 text-blue-600 dark:text-blue-400 font-medium">{log.impact}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === "AI Suggestions" && (
            <div className="space-y-3">
              {extra.aiSuggestions.map((suggestion, index) => (
                <div key={index} className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <Bot className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800 dark:text-blue-200">{suggestion}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MachinesPage({ machines, orders, lastSchedule, onFailure, onReset }: Props) {
  const [search, setSearch] = useState("");
  const [failTarget, setFailTarget] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState<{ type: "warn" | "success" | "info"; msg: string }[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  const filteredMachines = machines.filter((machine) => {
    const query = search.trim().toLowerCase();
    const extra = MACHINE_EXTRA[machine.id];

    return (
      query.length === 0 ||
      machine.id.toLowerCase().includes(query) ||
      extra?.name.toLowerCase().includes(query) ||
      machine.paperTypes.join(" ").toLowerCase().includes(query)
    );
  });

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

      if (!res.ok) {
        throw new Error(data.error || "Simulation failed");
      }

      onFailure(data);
      setNotif([
        { type: "warn", msg: `${failTarget} breakdown detected - ${data.remainingQty.toLocaleString()} pieces remaining.` },
        { type: "info", msg: `AI reassigned ${data.remainingQty.toLocaleString()} pieces to ${data.backupMachineId}.` },
        { type: "success", msg: `New schedule generated. SLA: ${data.result.slaStatus}. ${data.result.explanation || ""}` },
      ]);
    } catch (err: unknown) {
      setNotif([{ type: "warn", msg: err instanceof Error ? err.message : "Simulation failed" }]);
    } finally {
      setLoading(false);
    }
  }

  if (selectedMachine) {
    return <MachineDetail machine={selectedMachine} machines={machines} orders={orders} lastSchedule={lastSchedule} onBack={() => setSelectedMachine(null)} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Machines ({machines.length})</h2>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search machines"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredMachines.map((machine) => {
          const cfg = STATUS_CONFIG[machine.status] || STATUS_CONFIG.available;
          const extra = MACHINE_EXTRA[machine.id];

          return (
            <button
              key={machine.id}
              onClick={() => setSelectedMachine(machine)}
              className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-left hover:border-blue-500 transition-colors"
            >
              <div className="flex items-start justify-between mb-2 gap-3">
                <div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{machine.id}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{machine.speed} sheets/hr - {machine.capacity.toLocaleString()}/day</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                  <Badge variant={cfg.badge}>{cfg.label}</Badge>
                </div>
              </div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{extra?.name || machine.id}</p>
              <p className="text-xs text-gray-400 mb-2">Papers: {machine.paperTypes.join(", ")}</p>
              {machine.assignedOrderId && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">Assigned: {machine.assignedOrderId}</p>
              )}
              <LiveJobProgress machine={machine} />
              {machine.queue.length > 1 && (
                <div className="mt-1 flex flex-col gap-0.5">
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {machine.queue.length - 1} queued behind current job
                  </p>
                  {machine.queue.some((j) => j.status === "paused") && (
                    <p className="text-xs font-medium text-red-500">
                      Contains paused/preempted work
                    </p>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Breakdown simulator</h3>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Simulate a mid-run machine failure. The AI will automatically reassign remaining work to the backup machine and recalculate SLA.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={failTarget}
            onChange={(event) => setFailTarget(event.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {machines
              .filter((machine) => machine.status === "available" || machine.status === "busy")
              .map((machine) => <option key={machine.id} value={machine.id}>{machine.id}</option>)}
          </select>
          <button
            onClick={triggerFailure}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
            {loading ? "Simulating..." : "Trigger breakdown"}
          </button>
          <button
            onClick={() => { onReset(); setNotif([]); }}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
        </div>

        {notif.length > 0 && (
          <div className="mt-4 space-y-2">
            {notif.map((item, index) => (
              <div
                key={index}
                className={`px-4 py-2.5 rounded-lg text-sm flex items-start gap-2 ${item.type === "warn" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : item.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"}`}
              >
                {item.type === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                {item.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
