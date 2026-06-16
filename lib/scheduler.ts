import { Machine, Order, QueuedJob, ScheduleResult, ScheduledTask } from "@/types";
import { differenceInMinutes, format } from "date-fns";
import { v4 as uuidv4 } from "uuid";
import { computeRealFinish } from "@/lib/timeEngine";

export const MACHINE_PAPER_TYPES: Record<string, string[]> = {
  M1: ["Coated"],
  M2: ["Glossy"],
  M3: ["Matte"],
  M4: ["Uncoated"],
  M5: ["Coated", "Glossy", "Matte", "Uncoated"],
};

export const DEFAULT_MACHINES: Machine[] = [
  { id: "M1", speed: 500, capacity: 10000, status: "available", paperTypes: MACHINE_PAPER_TYPES.M1, utilisation: 0, queue: [] },
  { id: "M2", speed: 400, capacity: 8000,  status: "busy",      paperTypes: MACHINE_PAPER_TYPES.M2, utilisation: 0, queue: [] },
  { id: "M3", speed: 600, capacity: 12000, status: "available", paperTypes: MACHINE_PAPER_TYPES.M3, utilisation: 0, queue: [] },
  { id: "M4", speed: 450, capacity: 9000,  status: "available", paperTypes: MACHINE_PAPER_TYPES.M4, utilisation: 0, queue: [] },
  { id: "M5", speed: 300, capacity: 6000,  status: "backup",    paperTypes: MACHINE_PAPER_TYPES.M5, utilisation: 0, queue: [] },
];

export function normaliseMachine(machine: Machine): Machine {
  return { ...machine, paperTypes: MACHINE_PAPER_TYPES[machine.id] || machine.paperTypes, queue: machine.queue || [] };
}

export function seedM2WithRunningJob(machines: Machine[]): Machine[] {
  return machines.map((machine) => {
    const normalised = normaliseMachine(machine);
    if (normalised.id !== "M2" || normalised.queue.length > 0) return normalised;

    const factoryHours = 1.5;
    const startedAt = new Date();
    const realFinishAt = computeRealFinish(startedAt, factoryHours);
    const job: QueuedJob = {
      jobId: uuidv4().slice(0, 8),
      orderId: "ORD-SEED-M2",
      machineId: "M2",
      assignedQty: Math.round(normalised.speed * factoryHours),
      estimatedHours: factoryHours,
      startedAt: startedAt.toISOString(),
      realFinishAt: realFinishAt.toISOString(),
      status: "running",
    };

    return {
      ...normalised,
      status: "busy",
      assignedOrderId: job.orderId,
      utilisation: 25,
      queue: [job],
    };
  });
}

function queueReadyAt(machine: Machine, fallback: Date): Date {
  const lastJob = machine.queue[machine.queue.length - 1];
  return lastJob ? new Date(lastJob.realFinishAt) : fallback;
}

export function runScheduler(
  order: Order,
  machines: Machine[],
  machineAvailability: Record<string, Date> = {}
): ScheduleResult {
  const normalisedMachines = machines.map(normaliseMachine);
  const available = normalisedMachines
    .filter((m) => m.status === "available" && m.paperTypes.includes(order.paperType))
    .sort((a, b) => b.speed - a.speed);
  const queueable = normalisedMachines
    .filter((m) => m.status === "busy" && m.paperTypes.includes(order.paperType))
    .sort((a, b) => queueReadyAt(a, new Date()).getTime() - queueReadyAt(b, new Date()).getTime());
  const eligible = available.length > 0 ? available : queueable;

  if (eligible.length === 0) {
    throw new Error(`No available or queueable machines support the required paper type: ${order.paperType}.`);
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
    const startTime = queueReadyAt(m, now);
    const persistedAvailability = machineAvailability[m.id];
    const effectiveStart = persistedAvailability && persistedAvailability > startTime ? persistedAvailability : startTime;
    const finish = computeRealFinish(effectiveStart, hours);

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

export function dispatchScheduleToMachines(
  order: Order,
  schedule: ScheduleResult,
  machines: Machine[]
): Machine[] {
  return machines.map((machine) => {
    const normalised = normaliseMachine(machine);
    const task = schedule.tasks.find((item) => item.machineId === normalised.id);
    if (!task) return normalised;

    const isIdle = normalised.queue.length === 0 || normalised.status === "available";
    const startedAt = isIdle ? new Date() : queueReadyAt(normalised, new Date());
    const realFinishAt = isIdle ? new Date(task.estimatedFinish) : computeRealFinish(startedAt, task.estimatedHours);
    const job: QueuedJob = {
      jobId: task.jobId || uuidv4().slice(0, 8),
      orderId: order.id,
      machineId: normalised.id,
      assignedQty: task.assignedQty,
      estimatedHours: task.estimatedHours,
      startedAt: startedAt.toISOString(),
      realFinishAt: realFinishAt.toISOString(),
      status: isIdle ? "running" : "queued",
    };

    return {
      ...normalised,
      status: "busy",
      assignedOrderId: isIdle ? order.id : normalised.assignedOrderId,
      utilisation: isIdle ? Math.min(100, Math.max(10, Math.round((task.assignedQty / normalised.capacity) * 100))) : normalised.utilisation,
      queue: [...normalised.queue, job],
    };
  });
}

export function tickMachines(machines: Machine[]): {
  machines: Machine[];
  justCompleted: { orderId: string; machineId: string; jobId: string }[];
} {
  const justCompleted: { orderId: string; machineId: string; jobId: string }[] = [];

  const updated = machines.map((machine) => {
    const normalised = normaliseMachine(machine);
    if (normalised.queue.length === 0) {
      if (normalised.status === "busy") return { ...normalised, status: "available" as const, utilisation: 0, assignedOrderId: undefined };
      return normalised;
    }

    const current = normalised.queue[0];
    if (current.status !== "running" || Date.now() < new Date(current.realFinishAt).getTime()) {
      return normalised;
    }

    justCompleted.push({ orderId: current.orderId, machineId: normalised.id, jobId: current.jobId });
    const remainingQueue = normalised.queue.slice(1);
    if (remainingQueue.length === 0) {
      return { ...normalised, status: "available" as const, utilisation: 0, assignedOrderId: undefined, queue: [] };
    }

    const next = {
      ...remainingQueue[0],
      status: "running" as const,
      startedAt: new Date().toISOString(),
      realFinishAt: computeRealFinish(new Date(), remainingQueue[0].estimatedHours).toISOString(),
    };

    return {
      ...normalised,
      status: "busy" as const,
      assignedOrderId: next.orderId,
      utilisation: Math.min(100, Math.max(10, Math.round((next.assignedQty / normalised.capacity) * 100))),
      queue: [next, ...remainingQueue.slice(1)],
    };
  });

  return { machines: updated, justCompleted };
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
  const now = new Date();
  const startTime = machineAvailability[backup.id] && machineAvailability[backup.id] > now
    ? machineAvailability[backup.id]
    : now;
  const backupFinish = computeRealFinish(startTime, backupHours);

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
