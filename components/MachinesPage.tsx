"use client";
import { useState } from "react";
import { Machine, ScheduleResult } from "@/types";
import { Badge } from "@/components/ui/Badge";
import {
  AlertTriangle, RefreshCw, Loader2, Zap, Search,
  Download, Cpu, ChevronDown, ChevronRight, MoreVertical,
  ArrowLeft, Clock, Wrench, History, Bot, FileText,
} from "lucide-react";
import { ScheduledTask } from "@/types";

interface Props {
  machines: Machine[];
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

// ── Static extra detail data per machine (prototype) ──────────────────────
const MACHINE_EXTRA: Record<string, {
  name: string; type: string; location: string; operatorName: string;
  supervisorName: string; description: string; nextMaintenance: string;
  idleTime: string; woNo: string; slaDeadline: string;
  startDate: string; edd: string;
  runtimeSegments: { color: string; pct: number; label: string }[];
  downtimeLogs: { date: string; start: string; duration: string; reason: string; action: string; loggedBy: string; impact: string }[];
  jobHistory: { date: string; job: string; qty: number; status: string }[];
  aiSuggestions: string[];
}> = {
  M1: {
    name: "HP Indigo 7900 (M1)", type: "Production", location: "Offset",
    operatorName: "Arjun A.", supervisorName: "Printing",
    description: "Printing", nextMaintenance: "July 15, 2025",
    idleTime: "15 mins", woNo: "FO 1197601", slaDeadline: "7/7/2025",
    startDate: "5/7/2025", edd: "6/7/2025",
    runtimeSegments: [
      { color: "#22c55e", pct: 35, label: "Operating Normally" },
      { color: "#ef4444", pct: 18, label: "Stopped Unexpectedly" },
      { color: "#22c55e", pct: 20, label: "Operating Normally" },
      { color: "#a855f7", pct: 10, label: "Planned Stop" },
      { color: "#22c55e", pct: 10, label: "Operating Normally" },
      { color: "#3b82f6", pct: 4,  label: "Idle" },
      { color: "#d1d5db", pct: 3,  label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/3/2025", start: "10:00 am", duration: "45 min", reason: "Scheduled maintenance", action: "Part Changed", loggedBy: "Madhur", impact: "OF 123456" },
      { date: "7/4/2025", start: "2:30 pm",  duration: "1 hr",   reason: "Paper jam",            action: "Cleared jam",   loggedBy: "Arjun",  impact: "OF 123460" },
      { date: "7/5/2025", start: "11:00 am", duration: "30 min", reason: "Ink refill",            action: "Ink replaced",  loggedBy: "Madhur", impact: "None" },
    ],
    jobHistory: [
      { date: "7/1/2025", job: "Brochures – PrintCo", qty: 5000, status: "Completed" },
      { date: "7/3/2025", job: "Flyers – Bright Media", qty: 3000, status: "Completed" },
      { date: "7/5/2025", job: "Catalogue – Acme", qty: 2000, status: "In Progress" },
    ],
    aiSuggestions: [
      "Schedule preventive maintenance before July 20 to avoid unplanned downtime.",
      "Utilisation at 62% — consider assigning overflow from M2 during peak hours.",
      "3 unscheduled breakdowns this month. Recommend ink system inspection.",
    ],
  },
  M2: {
    name: "SM-52 Heidelberg (M2)", type: "Offset", location: "Offset",
    operatorName: "Rahul K.", supervisorName: "Printing",
    description: "Printing", nextMaintenance: "July 12, 2025",
    idleTime: "3 hrs", woNo: "FO 1197602", slaDeadline: "7/8/2025",
    startDate: "5/7/2025", edd: "6/7/2025",
    runtimeSegments: [
      { color: "#f59e0b", pct: 60, label: "Operating Normally" },
      { color: "#a855f7", pct: 20, label: "Planned Stop" },
      { color: "#d1d5db", pct: 20, label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/2/2025", start: "9:00 am", duration: "2 hrs", reason: "Roller change", action: "Roller replaced", loggedBy: "Rahul", impact: "OF 123455" },
    ],
    jobHistory: [{ date: "7/4/2025", job: "Annual Report – Vega", qty: 1500, status: "In Progress" }],
    aiSuggestions: ["Machine underutilised at 42%. Consider reassigning jobs from overloaded machines."],
  },
  M3: {
    name: "SX-52 4C+ Coating (M3)", type: "Production", location: "Offset",
    operatorName: "Priya S.", supervisorName: "Printing",
    description: "Printing", nextMaintenance: "July 18, 2025",
    idleTime: "0 mins", woNo: "FO 1197603", slaDeadline: "7/7/2025",
    startDate: "5/7/2025", edd: "6/7/2025",
    runtimeSegments: [
      { color: "#22c55e", pct: 55, label: "Operating Normally" },
      { color: "#ef4444", pct: 10, label: "Stopped Unexpectedly" },
      { color: "#22c55e", pct: 30, label: "Operating Normally" },
      { color: "#d1d5db", pct: 5,  label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/5/2025", start: "3:00 pm", duration: "30 min", reason: "Coating unit jam", action: "Cleared", loggedBy: "Priya", impact: "OF 123470" },
    ],
    jobHistory: [
      { date: "7/2/2025", job: "Posters – Bright Media", qty: 4000, status: "Completed" },
      { date: "7/6/2025", job: "Brochures – PrintCo",   qty: 4000, status: "In Progress" },
    ],
    aiSuggestions: [
      "Running at 103% utilisation — redistribute 1,000 sheets to M4 to avoid overload.",
      "Coating unit flagged for inspection after today's jam event.",
    ],
  },
  M4: {
    name: "Auto Die Cutting (M4)", type: "Post Production", location: "Offset",
    operatorName: "Kiran M.", supervisorName: "Printing",
    description: "Printing", nextMaintenance: "July 12, 2025",
    idleTime: "3 hrs", woNo: "FO 1197604", slaDeadline: "7/7/2025",
    startDate: "5/7/2025", edd: "6/7/2025",
    runtimeSegments: [
      { color: "#22c55e", pct: 40, label: "Operating Normally" },
      { color: "#a855f7", pct: 15, label: "Planned Stop" },
      { color: "#22c55e", pct: 25, label: "Operating Normally" },
      { color: "#3b82f6", pct: 10, label: "Idle" },
      { color: "#d1d5db", pct: 10, label: "Idle" },
    ],
    downtimeLogs: [
      { date: "7/3/2025", start: "11:00 am", duration: "1 hr 7 min", reason: "Blade replacement", action: "Blade changed", loggedBy: "Kiran", impact: "OF 123456" },
      { date: "7/4/2025", start: "1:00 pm",  duration: "45 min",     reason: "Planned stop",      action: "Lubrication",   loggedBy: "Kiran", impact: "None" },
      { date: "7/6/2025", start: "10:30 am", duration: "1 hr",       reason: "Unscheduled stop",  action: "Sensor reset",  loggedBy: "Kiran", impact: "OF 123480" },
    ],
    jobHistory: [
      { date: "7/1/2025", job: "Flyers – Acme",         qty: 3000, status: "Completed" },
      { date: "7/5/2025", job: "Catalogue – Vega Corp", qty: 3000, status: "In Progress" },
    ],
    aiSuggestions: [
      "Total downtime 6 hr 45 min this week — above threshold. Schedule full inspection.",
      "3 unscheduled breakdowns detected. Recommend sensor diagnostic before next shift.",
      "Idle time 3 hrs — can absorb 2,000 sheets from M3 overload.",
    ],
  },
  M5: {
    name: "UV Machine Nano (M5)", type: "Offset", location: "Offset",
    operatorName: "Suresh P.", supervisorName: "Printing",
    description: "Backup / UV Coating", nextMaintenance: "July 22, 2025",
    idleTime: "5 hrs", woNo: "—", slaDeadline: "—",
    startDate: "—", edd: "—",
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
  available: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Running Well" },
  busy:      { bg: "bg-amber-100",   text: "text-amber-800",   label: "Underused" },
  backup:    { bg: "bg-gray-100",    text: "text-gray-600",    label: "Idle" },
  breakdown: { bg: "bg-red-100",     text: "text-red-800",     label: "Breakdown" },
};

const DETAIL_TABS = ["Machine Details", "Job History", "Downtime & Maintenance Logs", "AI Suggestions"] as const;
type DetailTab = typeof DETAIL_TABS[number];

// ── Machine detail panel (Image 1) ──────────────────────────────────────────
function MachineDetail({ machine, onBack }: { machine: Machine; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>("Downtime & Maintenance Logs");
  const extra = MACHINE_EXTRA[machine.id] || MACHINE_EXTRA["M4"];
  const ss = STATUS_STYLES[machine.status];
  const jobProgress = Math.min(100, machine.utilisation);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <button onClick={onBack} className="flex items-center gap-1 hover:text-blue-600 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Machines
        </button>
        <ChevronRight className="w-3 h-3" />
        <span className="text-gray-900 dark:text-gray-100 font-medium">{extra.name}</span>
      </div>

      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">{extra.name}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Machine card */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-3 mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{extra.name}</h3>
            <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${ss.bg} ${ss.text}`}>{ss.label}</span>
          </div>
          <div className="flex gap-6">
            {/* Machine image placeholder */}
            <div className="w-28 h-28 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Cpu className="w-12 h-12 text-gray-400" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm flex-1">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Machine ID</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{machine.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Operator Name</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{extra.operatorName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Description</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{extra.description}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Supervisor Name</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{extra.supervisorName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Next Maintenance Date</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{extra.nextMaintenance}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Speed</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{machine.speed} sheets/hr</p>
              </div>
            </div>
          </div>
        </div>

        {/* Job status card */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Job Status</h3>
            <span className="text-sm text-gray-500">1/200</span>
          </div>
          <div className="space-y-2 text-sm mb-4">
            <div><span className="text-gray-500">Wo no: </span><span className="font-semibold">{extra.woNo}</span></div>
            <div><span className="text-gray-500">SLA Deadline: </span><span className="font-semibold">{extra.slaDeadline}</span></div>
            <div><span className="text-gray-500">Start Date: </span><span className="font-semibold">{extra.startDate}</span></div>
            <div><span className="text-gray-500">EDD: </span><span className="font-semibold">{extra.edd}</span></div>
          </div>
          {/* Semicircle gauge */}
          <div className="flex items-center justify-center">
            <div className="relative w-28 h-16 overflow-hidden">
              <div className="absolute inset-0 rounded-t-full border-[12px] border-gray-200 dark:border-gray-700 border-b-0" />
              <div
                className="absolute inset-0 rounded-t-full border-[12px] border-emerald-500 border-b-0 origin-bottom"
                style={{ transform: `rotate(${(jobProgress / 100) * 180}deg)`, clipPath: "inset(0 0 0 0)" }}
              />
              <div className="absolute bottom-0 left-0 right-0 text-center">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">In Progress</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Runtime overview */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Machine Runtime Overview</h3>
        <p className="text-xs text-gray-500 mb-3">Current Shift Duration: <span className="font-semibold text-gray-900 dark:text-gray-100">5 Hrs 00 Mins</span></p>
        {/* Legend */}
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          {[
            { color: "#22c55e", label: "Operating Normally" },
            { color: "#ef4444", label: "Stopped Unexpectedly" },
            { color: "#a855f7", label: "Planned Stop" },
            { color: "#3b82f6", label: "Idle" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: l.color }} />
              <span className="text-xs text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
        {/* Segmented bar */}
        <div className="flex h-8 rounded-lg overflow-hidden w-full">
          {extra.runtimeSegments.map((seg, i) => (
            <div
              key={i}
              title={seg.label}
              style={{ width: `${seg.pct}%`, background: seg.color }}
              className="transition-all"
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>9:00</span><span>13:00</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="flex border-b border-gray-200 dark:border-gray-800 px-5 overflow-x-auto">
          {DETAIL_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${tab === t ? "border-blue-600 text-blue-700 dark:text-blue-400 font-medium" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Machine Details */}
          {tab === "Machine Details" && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                ["Machine ID", machine.id],
                ["Type", extra.type],
                ["Location", extra.location],
                ["Speed", `${machine.speed} sheets/hr`],
                ["Capacity", `${machine.capacity.toLocaleString()} sheets/day`],
                ["Paper Types", machine.paperTypes.join(", ")],
                ["Next Maintenance", extra.nextMaintenance],
                ["Operator", extra.operatorName],
              ].map(([k, v]) => (
                <div key={k} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-400 mb-0.5">{k}</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{v}</p>
                </div>
              ))}
            </div>
          )}

          {/* Job History */}
          {tab === "Job History" && (
            extra.jobHistory.length === 0
              ? <p className="text-sm text-gray-400 text-center py-6">No job history for this machine.</p>
              : <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  <div className="grid grid-cols-4 text-xs font-medium text-gray-400 uppercase pb-2">
                    <span>Date</span><span>Job</span><span>Qty</span><span>Status</span>
                  </div>
                  {extra.jobHistory.map((j, i) => (
                    <div key={i} className="grid grid-cols-4 py-2.5 text-sm">
                      <span className="text-gray-500">{j.date}</span>
                      <span className="text-gray-800 dark:text-gray-200">{j.job}</span>
                      <span className="text-gray-600 dark:text-gray-400">{j.qty.toLocaleString()}</span>
                      <span className={`text-xs font-medium ${j.status === "Completed" ? "text-emerald-600" : "text-amber-600"}`}>{j.status}</span>
                    </div>
                  ))}
                </div>
          )}

          {/* Downtime & Maintenance Logs */}
          {tab === "Downtime & Maintenance Logs" && (
            <div>
              <div className="grid grid-cols-4 gap-4 mb-5">
                {[
                  { label: "Total Downtime", value: "6 hr 45 Mins" },
                  { label: "Scheduled Maintenance events", value: "2" },
                  { label: "Unscheduled Breakdowns", value: "3" },
                  { label: "Average Downtime Per Event", value: "1 hr 7 min" },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
                  </div>
                ))}
              </div>
              {extra.downtimeLogs.length === 0
                ? <p className="text-sm text-gray-400 text-center py-4">No downtime logs.</p>
                : <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          {["Date", "Start Time", "Duration", "Reason", "Action Taken", "Logged By", "Job Impact"].map((h) => (
                            <th key={h} className="text-left text-xs font-medium text-gray-400 pb-2 pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {extra.downtimeLogs.map((l, i) => (
                          <tr key={i}>
                            <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{l.date}</td>
                            <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap">{l.start}</td>
                            <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300 whitespace-nowrap">{l.duration}</td>
                            <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{l.reason}</td>
                            <td className="py-2.5 pr-4 text-gray-700 dark:text-gray-300">{l.action}</td>
                            <td className="py-2.5 pr-4 text-gray-500">{l.loggedBy}</td>
                            <td className="py-2.5 text-blue-600 dark:text-blue-400 font-medium">{l.impact}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </div>
          )}

          {/* AI Suggestions */}
          {tab === "AI Suggestions" && (
            <div className="space-y-3">
              {extra.aiSuggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <Bot className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800 dark:text-blue-200">{s}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main MachinesPage (list view = Image 2) ───────────────────────────────
export function MachinesPage({ machines, lastSchedule, onFailure, onReset }: Props) {
  const [search, setSearch] = useState("");
  const [failTarget, setFailTarget] = useState("M1");
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState<{ type: "warn" | "success" | "info"; msg: string }[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [showSim, setShowSim] = useState(false);

  const filtered = machines.filter(
    (m) =>
      m.id.toLowerCase().includes(search.toLowerCase()) ||
      (MACHINE_EXTRA[m.id]?.name || "").toLowerCase().includes(search.toLowerCase())
  );

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

  // Show detail view when a machine is selected
  if (selectedMachine) {
    return <MachineDetail machine={selectedMachine} onBack={() => setSelectedMachine(null)} />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          Machines ({machines.length})
        </h2>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>Dashboard</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700 dark:text-gray-300">Machines</span>
        </div>
      </div>

      {/* Machine list table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">
              <Download className="w-4 h-4" /> Export to Excel
            </button>
            <button
              onClick={() => setShowSim(!showSim)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg font-semibold hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
            >
              <Zap className="w-4 h-4" /> AI Optimise
            </button>
          </div>
        </div>

        {/* Table header */}
        <div className="px-5 py-2 border-b border-gray-100 dark:border-gray-800 grid grid-cols-7 text-xs font-medium text-gray-400 uppercase tracking-wide">
          <span className="col-span-2">Machine</span>
          <span>Status</span>
          <span>Location</span>
          <span>Type</span>
          <span>Utilisation%</span>
          <span>Next Maintenance</span>
        </div>

        {/* Rows */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filtered.map((m) => {
            const extra = MACHINE_EXTRA[m.id];
            const ss = STATUS_STYLES[m.status];
            return (
              <div
                key={m.id}
                className="px-5 py-3 grid grid-cols-7 items-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                {/* Machine name + expand */}
                <div className="col-span-2 flex items-center gap-2">
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <MoreVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <button
                    onClick={() => setSelectedMachine(m)}
                    className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                  >
                    {extra?.name || m.id}
                  </button>
                </div>
                {/* Status */}
                <div>
                  <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${ss.bg} ${ss.text}`}>
                    {ss.label}
                  </span>
                </div>
                {/* Location */}
                <span className="text-sm text-gray-600 dark:text-gray-400">{extra?.location || "Offset"}</span>
                {/* Type */}
                <span className="text-sm text-gray-600 dark:text-gray-400">{extra?.type || "Production"}</span>
                {/* Utilisation */}
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.status === "available" ? "bg-emerald-500" : m.status === "busy" ? "bg-amber-500" : "bg-gray-400"}`}
                      style={{ width: `${Math.min(m.utilisation, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">{m.utilisation}%</span>
                </div>
                {/* Next maintenance */}
                <span className="text-sm text-gray-500">{extra?.nextMaintenance || "—"}</span>
              </div>
            );
          })}
        </div>

        {/* Pagination footer */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((p) => (
              <button key={p} className={`w-7 h-7 rounded text-sm ${p === 1 ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"}`}>{p}</button>
            ))}
            <span className="text-gray-400 text-sm px-1">...</span>
          </div>
          <span className="text-xs text-gray-400">1 of 01 pages ({machines.length} items)</span>
        </div>
      </div>

      {/* AI Optimise / Breakdown simulator panel */}
      {showSim && (
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
              onChange={(e) => setFailTarget(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {machines.filter((m) => m.status === "available" || m.status === "busy").map((m) => (
                <option key={m.id} value={m.id}>{m.id}</option>
              ))}
            </select>
            <button
              onClick={triggerFailure}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
              {loading ? "Simulating…" : "Trigger breakdown"}
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
              {notif.map((n, i) => (
                <div
                  key={i}
                  className={`px-4 py-2.5 rounded-lg text-sm flex items-start gap-2 ${n.type === "warn" ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : n.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800" : "bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800"}`}
                >
                  {n.type === "warn" ? <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />}
                  {n.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}