export type MachineStatus = "available" | "busy" | "backup" | "breakdown";

export interface QueuedJob {
  jobId: string;          // unique id for this task instance
  orderId: string;
  machineId: string;
  priority: "High" | "Medium" | "Low";
  assignedQty: number;           // original total qty assigned to this job
  estimatedHours: number;        // "factory time" hours this job takes (current remaining duration)
  totalEstimatedHours: number;   // original full duration, used to compute % complete
  startedAt: string;             // ISO, real wall-clock time job (re)started running
  realFinishAt: string;          // ISO, real wall-clock time job will actually complete (compressed)
  status: "queued" | "running" | "paused" | "completed";
}

export interface DowntimeLog {
  date: string;
  start: string;
  end?: string;
  duration: string;
  reason: string;
  action: string;
  loggedBy: string;
  impact: string;
}

export interface MachineStateLog {
  timestamp: string;
  status: MachineStatus;
  orderId?: string;
  reason?: string;
}

export interface Machine {
  id: string;
  speed: number; // sheets/hour
  capacity: number; // sheets/day
  status: MachineStatus;
  paperTypes: string[];
  utilisation: number; // 0-100
  assignedOrderId?: string;
  queue: QueuedJob[]; // jobs waiting/running on this machine, in order
  downtimeLogs?: DowntimeLog[]; // persistent breakdown/maintenance history
  stateHistory?: MachineStateLog[]; // state changes for runtime overview
  shiftStartTime?: string; // when the current shift started
}

export type Priority = "High" | "Medium" | "Low";
export type OrderStatus = "Pending" | "Pending Approval" | "Scheduled" | "In Progress" | "Completed" | "At Risk";

export interface Order {
  id: string;
  customer: string;
  product: string;
  quantity: number;
  paperType: string;
  priority: Priority;
  deadline: string; // ISO string
  status: OrderStatus;
  createdAt: string;
}

export interface ScheduledTask {
  machineId: string;
  machineSpeed: number;
  assignedQty: number;
  estimatedHours: number;
  estimatedFinish: string; // ISO string (real, compressed finish time)
  jobId?: string; // links to QueuedJob.jobId once dispatched
}

export interface ScheduleResult {
  orderId: string;
  tasks: ScheduledTask[];
  overallFinish: string;
  slaStatus: "SAFE" | "RISK";
  slaDiff: number; // minutes difference (+ahead / -behind)
  explanation?: string;
  risk?: RiskAnalysis;
}

export interface RiskAnalysis {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  anomalies: string[];
  recommendation: string;
}

export interface PreemptionEvent {
  machineId: string;
  bumpedOrderId: string;
  bumpedJobId: string;
  bumpedPriority: "High" | "Medium" | "Low";
  newOrderId: string;
  newJobId: string;
  newPriority: "High" | "Medium" | "Low";
  reason: "preempted" | "overflow-to-backup"; // preempted = paused on same machine, overflow = sent to M5
  bumpedProgressPercent: number;
}

export interface FailureSimulation {
  failedMachineId: string;
  remainingQty: number;
  reassignedTo: string;
  newFinish: string;
  slaStatus: "SAFE" | "RISK";
  notification: string;
}
