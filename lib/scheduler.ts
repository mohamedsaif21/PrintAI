import { Machine, Order, ScheduleResult, ScheduledTask, QueuedJob, PreemptionEvent } from "@/types";
import { differenceInMinutes } from "date-fns";
import { computeRealFinish } from "@/lib/timeEngine";
import { v4 as uuidv4 } from "uuid";
import { resolveMachineConflict, buildJob, priorityBeats, resumeNextIfPaused } from "@/lib/priorityEngine";

export const MACHINE_PAPER_TYPES: Record<string, string[]> = {
  M1: ["Coated"],
  M2: ["Glossy"],
  M3: ["Matte"],
  M4: ["Uncoated"],
  M5: ["Coated", "Glossy", "Matte", "Uncoated"],
};

export const DEFAULT_MACHINES: Machine[] = [
  { id: "M1", speed: 500, capacity: 10000, status: "available", paperTypes: MACHINE_PAPER_TYPES.M1, utilisation: 0, queue: [], stateHistory: [], shiftStartTime: new Date().toISOString() },
  { id: "M2", speed: 400, capacity: 8000,  status: "busy",      paperTypes: MACHINE_PAPER_TYPES.M2, utilisation: 0, queue: [], stateHistory: [], shiftStartTime: new Date().toISOString() },
  { id: "M3", speed: 600, capacity: 12000, status: "available", paperTypes: MACHINE_PAPER_TYPES.M3, utilisation: 0, queue: [], stateHistory: [], shiftStartTime: new Date().toISOString() },
  { id: "M4", speed: 450, capacity: 9000,  status: "available", paperTypes: MACHINE_PAPER_TYPES.M4, utilisation: 0, queue: [], stateHistory: [], shiftStartTime: new Date().toISOString() },
  { id: "M5", speed: 300, capacity: 6000,  status: "backup",    paperTypes: MACHINE_PAPER_TYPES.M5, utilisation: 0, queue: [], stateHistory: [], shiftStartTime: new Date().toISOString() },
];

export function normaliseMachine(machine: Machine): Machine {
  return {
    ...machine,
    paperTypes: MACHINE_PAPER_TYPES[machine.id] || machine.paperTypes,
    queue: machine.queue || [],
  };
}

function queueReadyAt(machine: Machine, fallback: Date): Date {
  const lastJob = machine.queue[machine.queue.length - 1];
  return lastJob ? new Date(lastJob.realFinishAt) : fallback;
}

/**
 * Seeds M2 with one already-running demo job so it starts "busy" for a
 * realistic reason instead of being permanently busy with nothing behind it.
 * Call this once when initialising fresh state (e.g. on the client on first load).
 */
export function seedM2WithRunningJob(machines: Machine[]): Machine[] {
  return machines.map(normaliseMachine).map((m) => {
    if (m.id !== "M2" || m.queue.length > 0) return m;
    const factoryHours = 1.5; // a believable in-progress job
    const startedAt = new Date();
    const realFinishAt = computeRealFinish(startedAt, factoryHours);
    const job: QueuedJob = {
      jobId: uuidv4().slice(0, 8),
      orderId: "ORD-SEED-M2",
      machineId: "M2",
      priority: "Medium", // seeded job defaults to Medium so a High order can realistically preempt it
      assignedQty: Math.round(m.speed * factoryHours),
      estimatedHours: factoryHours,
      totalEstimatedHours: factoryHours,
      startedAt: startedAt.toISOString(),
      realFinishAt: realFinishAt.toISOString(),
      status: "running",
    };
    return { ...m, status: "busy", assignedOrderId: job.orderId, utilisation: 25, queue: [job] };
  });
}

/**
 * Rule-based AI scheduler.
 * Considers machines that are truly free right now (status === "available"),
 * AND busy machines where this order's priority is high enough to preempt
 * whatever is currently running there. Backup (M5) and breakdown machines
 * are never picked directly by the normal scheduler — M5 is reserved for
 * breakdown recovery and same-priority overflow handled by the priority engine.
 */
export function runScheduler(order: Order, machines: Machine[]): ScheduleResult {
  const normalisedMachines = machines.map(normaliseMachine);
  const eligible = normalisedMachines
    .filter((m) => m.id !== "M5")
    .filter((m) => m.status === "available" || m.status === "busy")
    .filter((m) => m.paperTypes.includes(order.paperType))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "available" ? -1 : 1;
      return b.speed - a.speed;
    });

  if (eligible.length === 0) {
    throw new Error(`No production machine is currently able to schedule ${order.paperType} work.`);
  }

  const totalSpeed = eligible.reduce((sum, m) => sum + m.speed, 0);
  const now = new Date();

  const tasks: ScheduledTask[] = eligible.map((m) => {
    const share = Math.round((m.speed / totalSpeed) * order.quantity);
    const factoryHours = share / m.speed; // "factory time" hours
    const runningJob = m.queue.find((job) => job.status === "running");
    const canPreempt = runningJob ? priorityBeats(order.priority, runningJob.priority) : false;
    const startAt = m.status === "busy" && !canPreempt ? queueReadyAt(m, now) : now;
    const realFinish = computeRealFinish(startAt, factoryHours);
    return {
      machineId: m.id,
      machineSpeed: m.speed,
      assignedQty: share,
      estimatedHours: parseFloat(factoryHours.toFixed(2)),
      estimatedFinish: realFinish.toISOString(),
    };
  });

  const overallFinish = new Date(Math.max(...tasks.map((t) => new Date(t.estimatedFinish).getTime())));
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

/**
 * Dispatches a freshly-generated schedule onto each machine's queue, applying
 * priority conflict resolution wherever a task lands on a machine that's
 * already busy with a running job (preemption, queueing, or M5 overflow).
 * Returns the updated machines plus any PreemptionEvents that occurred,
 * so the caller can show clear notifications about what happened and why.
 */
export function dispatchScheduleToMachines(
  order: Order,
  schedule: ScheduleResult,
  machines: Machine[]
): { machines: Machine[]; events: PreemptionEvent[] } {
  const working = machines.map(normaliseMachine);
  const events: PreemptionEvent[] = [];

  for (const task of schedule.tasks) {
    const targetIdx = working.findIndex((m) => m.id === task.machineId);
    if (targetIdx === -1) continue;
    const target = working[targetIdx];

    const newJob = buildJob({
      orderId: order.id,
      machineId: target.id,
      priority: order.priority,
      assignedQty: task.assignedQty,
      factoryHours: task.estimatedHours,
      status: "queued", // resolveMachineConflict will set the correct status
    });

    const backupIdx = working.findIndex((m) => m.id === "M5" && m.id !== target.id);
    const backup = backupIdx !== -1 ? working[backupIdx] : undefined;

    const { updatedTargetMachine, updatedBackupMachine, event } = resolveMachineConflict(target, backup, newJob);

    working[targetIdx] = updatedTargetMachine;
    if (updatedBackupMachine && backupIdx !== -1) {
      working[backupIdx] = updatedBackupMachine;
    }
    if (event) events.push(event);
  }

  return { machines: working, events };
}

/**
 * Tick function — call this periodically (e.g. every 3s) on the client.
 * Checks every machine's running job; if its compressed real-time has elapsed,
 * marks it completed, frees the machine, and auto-starts the next queued job
 * on that same machine (if any) — including correctly RESUMING a paused job
 * (one that was preempted earlier) with its frozen remaining duration.
 * Returns { machines, justCompleted } so the caller can update order statuses.
 */
export function tickMachines(machines: Machine[]): {
  machines: Machine[];
  justCompleted: { orderId: string; machineId: string; jobId: string }[];
} {
  const justCompleted: { orderId: string; machineId: string; jobId: string }[] = [];

  const updated = machines.map((m) => {
    if (m.queue.length === 0) {
      if (m.status === "busy") return { ...m, status: "available" as const, utilisation: 0 };
      return m;
    }

    const current = m.queue[0];

    // queue[0] should always be the active slot: either "running" (in progress)
    // or "paused" (meaning nothing is currently running on this machine and
    // this paused job is next up — which only happens right after the job
    // that preempted it has completed and been popped off, see below).
    if (current.status === "paused") {
      const resumedQueue = resumeNextIfPaused(m.queue);
      return { ...m, status: "busy" as const, queue: resumedQueue };
    }

    if (current.status !== "running") return m;

    const finished = Date.now() >= new Date(current.realFinishAt).getTime();
    if (!finished) {
      return m; // still running, leave as-is
    }

    // Job finished: pop it, mark completed, start next if present
    justCompleted.push({ orderId: current.orderId, machineId: m.id, jobId: current.jobId });
    const remainingQueue = m.queue.slice(1);

    if (remainingQueue.length === 0) {
      return { ...m, status: "available" as const, queue: [], utilisation: 0 };
    }

    // If the next item is a paused job (it was preempted by the job that just
    // finished), resume it now: fresh start, recomputed finish from its
    // frozen remaining hours.
    if (remainingQueue[0].status === "paused") {
      const resumedQueue = resumeNextIfPaused(remainingQueue);
      return { ...m, status: "busy" as const, queue: resumedQueue };
    }

    // Otherwise, auto-pick the next queued job on this machine
    const next = { ...remainingQueue[0], status: "running" as const, startedAt: new Date().toISOString() };
    const nextRealFinish = computeRealFinish(new Date(), next.estimatedHours);
    next.realFinishAt = nextRealFinish.toISOString();

    return {
      ...m,
      status: "busy" as const,
      queue: [next, ...remainingQueue.slice(1)],
    };
  });

  return { machines: updated, justCompleted };
}

export function simulateBreakdown(
  failedMachineId: string,
  completedFraction: number,
  originalTasks: ScheduledTask[],
  machines: Machine[],
  order: Order
): { newTasks: ScheduledTask[]; result: ScheduleResult } {
  const failedTask = originalTasks.find((t) => t.machineId === failedMachineId);
  if (!failedTask) throw new Error("Machine not found in tasks");

  const remainingQty = Math.round(failedTask.assignedQty * (1 - completedFraction));
  const backup = machines.find((m) => m.status === "backup");
  if (!backup) throw new Error("No backup machine available");

  const backupHours = remainingQty / backup.speed;
  const backupFinish = computeRealFinish(new Date(), backupHours);

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

  const overallFinish = new Date(Math.max(...newTasks.map((t) => new Date(t.estimatedFinish).getTime())));
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
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
