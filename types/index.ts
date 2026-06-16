export type MachineStatus = "available" | "busy" | "backup" | "breakdown";

export interface QueuedJob {
  jobId: string;
  orderId: string;
  machineId: string;
  assignedQty: number;
  estimatedHours: number;
  startedAt: string;
  realFinishAt: string;
  status: "queued" | "running" | "completed";
}

export interface Machine {
  id: string;
  speed: number; // sheets/hour
  capacity: number; // sheets/day
  status: MachineStatus;
  paperTypes: string[];
  utilisation: number; // 0-100
  assignedOrderId?: string;
  queue: QueuedJob[];
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
  estimatedFinish: string; // ISO string
  jobId?: string;
}

export interface RiskAnalysis {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  anomalies: string[];
  recommendation: string;
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

export interface FailureSimulation {
  failedMachineId: string;
  remainingQty: number;
  reassignedTo: string;
  newFinish: string;
  slaStatus: "SAFE" | "RISK";
  notification: string;
}
