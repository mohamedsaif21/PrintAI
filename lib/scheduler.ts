import { Machine, Order, ScheduleResult, ScheduledTask } from "@/types";
import { addMinutes, differenceInMinutes, format } from "date-fns";

export const DEFAULT_MACHINES: Machine[] = [
  { id: "M1", speed: 500, capacity: 10000, status: "available", paperTypes: ["Coated", "Glossy", "Matte", "Uncoated"], utilisation: 0 },
  { id: "M2", speed: 400, capacity: 8000,  status: "busy",      paperTypes: ["Coated", "Uncoated"],                    utilisation: 100 },
  { id: "M3", speed: 600, capacity: 12000, status: "available", paperTypes: ["Coated", "Glossy", "Matte", "Uncoated"], utilisation: 0 },
  { id: "M4", speed: 450, capacity: 9000,  status: "available", paperTypes: ["Coated", "Matte", "Uncoated"],           utilisation: 0 },
  { id: "M5", speed: 300, capacity: 6000,  status: "backup",    paperTypes: ["Coated", "Uncoated"],                    utilisation: 0 },
];

export function runScheduler(
  order: Order,
  machines: Machine[],
  machineAvailability: Record<string, Date> = {}
): ScheduleResult {
  // Step 1: Filter available machines that support the paper type
  const eligible = machines
    .filter((m) => m.status === "available" && m.paperTypes.includes(order.paperType))
    .sort((a, b) => b.speed - a.speed); // fastest first

  if (eligible.length === 0) {
    throw new Error(`No available machines support the required paper type: ${order.paperType}.`);
  }

  // Step 2: Split workload proportionally by speed
  const totalSpeed = eligible.reduce((sum, m) => sum + m.speed, 0);
  const now = new Date();

  let unassignedQuantity = order.quantity;
  const tasks: ScheduledTask[] = eligible.map((m, index) => {
    const isLast = index === eligible.length - 1;
    // Give the remaining deficit/surplus to the last machine to prevent rounding leaks
    const share = isLast ? unassignedQuantity : Math.round((m.speed / totalSpeed) * order.quantity);
    unassignedQuantity -= share;

    const hours = share / m.speed;
    const minutes = Math.round(hours * 60);
    
    const startTime = machineAvailability[m.id] && machineAvailability[m.id] > now
      ? machineAvailability[m.id]
      : now;
    const finish = addMinutes(startTime, minutes);

    return {
      machineId: m.id,
      machineSpeed: m.speed,
      assignedQty: share,
      estimatedHours: parseFloat(hours.toFixed(2)),
      estimatedFinish: finish.toISOString(),
    };
  });

  // Step 3: Overall finish = slowest task (latest finish time)
  const overallFinish = new Date(
    Math.max(...tasks.map((t) => new Date(t.estimatedFinish).getTime()))
  );
  const deadline = new Date(order.deadline);
  const diffMinutes = differenceInMinutes(deadline, overallFinish);

  return {
    orderId: order.id,
    tasks,
    overallFinish: overallFinish.toISOString(),
    slaStatus: diffMinutes >= 0 ? "SAFE" : "RISK",
    slaDiff: diffMinutes,
  };
}

export function simulateBreakdown(
  failedMachineId: string,
  completedFraction: number, // 0-1, how much the failed machine had done
  originalTasks: ScheduledTask[],
  machines: Machine[],
  order: Order,
  machineAvailability: Record<string, Date> = {}
): { newTasks: ScheduledTask[]; result: ScheduleResult } {
  const failedTask = originalTasks.find((t) => t.machineId === failedMachineId);
  if (!failedTask) throw new Error("Machine not found in tasks");

  const remainingQty = Math.round(failedTask.assignedQty * (1 - completedFraction));
  if (remainingQty <= 0) {
    throw new Error("Task already completed, no backup needed.");
  }

  const backup = machines.find((m) => m.status === "backup");
  if (!backup) throw new Error("No backup machine available");

  const backupHours = remainingQty / backup.speed;
  const backupMinutes = Math.round(backupHours * 60);

  const now = new Date();
  const startTime = machineAvailability[backup.id] && machineAvailability[backup.id] > now 
    ? machineAvailability[backup.id] 
    : now;
  const backupFinish = addMinutes(startTime, backupMinutes);

  const newTasks: ScheduledTask[] = [
    ...originalTasks.filter((t) => t.machineId !== failedMachineId),
    {
      machineId: backup.id,
      machineSpeed: backup.speed,
      assignedQty: remainingQty,
      estimatedHours: parseFloat(backupHours.toFixed(2)),
      estimatedFinish: backupFinish.toISOString(),
    },
  ];

  const overallFinish = new Date(
    Math.max(...newTasks.map((t) => new Date(t.estimatedFinish).getTime()))
  );
  const deadline = new Date(order.deadline);
  const diffMinutes = differenceInMinutes(deadline, overallFinish);

  return {
    newTasks,
    result: {
      orderId: order.id,
      tasks: newTasks,
      overallFinish: overallFinish.toISOString(),
      slaStatus: diffMinutes >= 0 ? "SAFE" : "RISK",
      slaDiff: diffMinutes,
    },
  };
}

export function formatFinishTime(iso: string): string {
  return format(new Date(iso), "hh:mm a");
}
