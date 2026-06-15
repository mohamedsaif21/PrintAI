export type MachineStatus = "available" | "busy" | "backup" | "breakdown";

export interface Machine {
  id: string;
  speed: number; // sheets/hour
  capacity: number; // sheets/day
  status: MachineStatus;
  paperTypes: string[];
  utilisation: number; // 0-100
  assignedOrderId?: string;
}

export type Priority = "High" | "Medium" | "Low";
export type OrderStatus = "Pending" | "Scheduled" | "In Progress" | "Completed" | "At Risk";

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
