import { Machine, Order, ScheduleResult, ScheduledTask, Priority, PreemptionEvent, QueuedJob } from "@/types";
import { differenceInMinutes } from "date-fns";
import { computeRealFinish, remainingFactoryHours } from "@/lib/timeEngine";
import { normaliseMachine } from "@/lib/scheduler";
import { buildJob, priorityBeats } from "@/lib/priorityEngine";

interface WhatIfResult {
  success: boolean;
  scheduleResult?: ScheduleResult;
  updatedMachines?: Machine[];
  warnings: string[];
  preemptionEvents: PreemptionEvent[];
  passUsed: 1 | 2 | 3;
}

/**
 * 3-Pass High Priority Scheduler
 * 
 * Pass 1 (Normal): Try normal scheduling on compatible machines
 * Pass 2 (Backup): If Pass 1 fails SLA, try M5 backup if it's free
 * Pass 3 (Preempt): If M5 is busy, preempt lower-priority running jobs
 */
export function scheduleHighPriorityOrder(
  order: Order,
  machines: Machine[]
): WhatIfResult {
  const warnings: string[] = [];
  const preemptionEvents: PreemptionEvent[] = [];

  if (order.priority !== "High") {
    return {
      success: false,
      warnings: ["This scheduler only handles High Priority orders"],
      preemptionEvents: [],
      passUsed: 1,
    };
  }

  const normalizedMachines = machines.map(normaliseMachine);
  
  // Find compatible machines (excluding M5 and breakdown machines)
  const compatibleMachines = normalizedMachines
    .filter((m) => m.id !== "M5")
    .filter((m) => m.status !== "breakdown")
    .filter((m) => m.paperTypes.includes(order.paperType));

  if (compatibleMachines.length === 0) {
    return {
      success: false,
      warnings: [`No compatible machines found for paper type: ${order.paperType}`],
      preemptionEvents: [],
      passUsed: 1,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PASS 1: Normal Scheduling (append to queue)
  // ═══════════════════════════════════════════════════════════════════
  const pass1Result = tryNormalScheduling(order, compatibleMachines, normalizedMachines);
  
  // Pass 1 succeeds ONLY if it can schedule with SLA SAFE
  if (pass1Result.success && pass1Result.scheduleResult!.slaStatus === "SAFE") {
    warnings.push("Pass 1: Normal scheduling successful - SLA SAFE");
    return {
      ...pass1Result,
      warnings,
      passUsed: 1,
    };
  }

  if (pass1Result.success && pass1Result.scheduleResult!.slaStatus === "RISK") {
    warnings.push("Pass 1: Normal scheduling would violate SLA - trying backup/preemption");
  } else {
    warnings.push("Pass 1: Normal scheduling failed");
  }

  // ═══════════════════════════════════════════════════════════════════
  // PASS 2: Backup Machine (M5)
  // ═══════════════════════════════════════════════════════════════════
  const m5 = normalizedMachines.find((m) => m.id === "M5");
  
  if (m5 && m5.status === "backup" && m5.queue.length === 0) {
    const pass2Result = tryBackupScheduling(order, m5, normalizedMachines);
    
    if (pass2Result.success) {
      warnings.push("Pass 2: Routed to Backup Machine M5 - SLA SAFE");
      return {
        ...pass2Result,
        warnings,
        passUsed: 2,
      };
    }
  }

  warnings.push("Pass 2: Backup M5 unavailable or busy");

  // ═══════════════════════════════════════════════════════════════════
  // PASS 3: Preemption (interrupt lower-priority running jobs)
  // ═══════════════════════════════════════════════════════════════════
  const pass3Result = tryPreemptionScheduling(order, compatibleMachines, normalizedMachines);
  
  if (pass3Result.success) {
    warnings.push("Pass 3: Preempted lower priority jobs to accommodate High Priority order");
    return {
      ...pass3Result,
      warnings: [...warnings, ...pass3Result.warnings],
      passUsed: 3,
    };
  }

  warnings.push("Pass 3: Preemption failed - all machines running High Priority jobs");

  // All passes failed
  return {
    success: false,
    warnings,
    preemptionEvents: [],
    passUsed: 3,
  };
}

/**
 * PASS 1: Try normal scheduling by appending to machine queues
 * For busy machines, new High priority jobs should be queued AFTER current work finishes
 */
function tryNormalScheduling(
  order: Order,
  compatibleMachines: Machine[],
  allMachines: Machine[]
): WhatIfResult {
  const warnings: string[] = [];
  const preemptionEvents: PreemptionEvent[] = [];

  // Filter to only available machines or those with empty queues for Pass 1
  // Pass 1 should NOT queue behind busy machines - that's what Pass 3 is for
  const availableMachines = compatibleMachines.filter((m) => 
    m.status === "available" || (m.status === "busy" && m.queue.length === 0)
  );

  if (availableMachines.length === 0) {
    return {
      success: false,
      scheduleResult: undefined,
      updatedMachines: undefined,
      warnings: ["No available machines for normal scheduling"],
      preemptionEvents: [],
      passUsed: 1,
    };
  }

  // Sort by speed (faster machines first)
  const sorted = [...availableMachines].sort((a, b) => b.speed - a.speed);
  const totalSpeed = sorted.reduce((sum, m) => sum + m.speed, 0);
  const now = new Date();

  let remainingQty = order.quantity;
  const tasks: ScheduledTask[] = sorted.map((m, index) => {
    const isLast = index === sorted.length - 1;
    const share = isLast ? remainingQty : Math.round((m.speed / totalSpeed) * order.quantity);
    remainingQty -= share;
    const factoryHours = share / m.speed;
    const realFinish = computeRealFinish(now, factoryHours);

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

  const scheduleResult: ScheduleResult = {
    orderId: order.id,
    tasks,
    overallFinish: overallFinish.toISOString(),
    slaStatus: diffMinutes >= 0 ? "SAFE" : "RISK",
    slaDiff: diffMinutes,
  };

  // Create updated machines with new jobs in queue
  const updatedMachines = allMachines.map((m) => {
    const task = tasks.find((t) => t.machineId === m.id);
    if (!task) return m;

    const newJob = buildJob({
      orderId: order.id,
      machineId: m.id,
      priority: order.priority,
      assignedQty: task.assignedQty,
      factoryHours: task.estimatedHours,
      status: "running",
    });

    return {
      ...m,
      status: "busy" as const,
      queue: [...m.queue, newJob],
    };
  });

  return {
    success: true,
    scheduleResult,
    updatedMachines,
    warnings,
    preemptionEvents,
    passUsed: 1,
  };
}

/**
 * PASS 2: Try backup machine M5
 */
function tryBackupScheduling(
  order: Order,
  m5: Machine,
  allMachines: Machine[]
): WhatIfResult {
  const warnings: string[] = [];
  const preemptionEvents: PreemptionEvent[] = [];

  const factoryHours = order.quantity / m5.speed;
  const now = new Date();
  const realFinish = computeRealFinish(now, factoryHours);

  const task: ScheduledTask = {
    machineId: m5.id,
    machineSpeed: m5.speed,
    assignedQty: order.quantity,
    estimatedHours: parseFloat(factoryHours.toFixed(2)),
    estimatedFinish: realFinish.toISOString(),
  };

  const deadline = new Date(order.deadline);
  const diffMinutes = differenceInMinutes(deadline, realFinish);

  const scheduleResult: ScheduleResult = {
    orderId: order.id,
    tasks: [task],
    overallFinish: realFinish.toISOString(),
    slaStatus: diffMinutes >= 0 ? "SAFE" : "RISK",
    slaDiff: diffMinutes,
  };

  const newJob = buildJob({
    orderId: order.id,
    machineId: m5.id,
    priority: order.priority,
    assignedQty: order.quantity,
    factoryHours: task.estimatedHours,
    status: "running",
  });

  const updatedMachines = allMachines.map((m) => {
    if (m.id === "M5") {
      return {
        ...m,
        status: "busy" as const,
        queue: [newJob],
      };
    }
    return m;
  });

  return {
    success: true,
    scheduleResult,
    updatedMachines,
    warnings,
    preemptionEvents,
    passUsed: 2,
  };
}

/**
 * PASS 3: Preempt lower-priority running jobs
 * Calculates exactly how many sheets are done, splits the running task,
 * and inserts the High Priority job in between.
 */
function tryPreemptionScheduling(
  order: Order,
  compatibleMachines: Machine[],
  allMachines: Machine[]
): WhatIfResult {
  const warnings: string[] = [];
  const preemptionEvents: PreemptionEvent[] = [];
  const now = Date.now();

  // Find machines with lower-priority running jobs
  const preemptableMachines = compatibleMachines.filter((m) => {
    const runningJob = m.queue.find((job) => job.status === "running");
    return runningJob && priorityBeats(order.priority, runningJob.priority);
  });

  if (preemptableMachines.length === 0) {
    return {
      success: false,
      warnings: ["No preemptable machines found - all running High Priority jobs"],
      preemptionEvents: [],
      passUsed: 3,
    };
  }

  // Choose the best machine to preempt (fastest available)
  const targetMachine = preemptableMachines.sort((a, b) => b.speed - a.speed)[0];
  const runningJobIndex = targetMachine.queue.findIndex((job) => job.status === "running");
  const runningJob = targetMachine.queue[runningJobIndex];

  // Calculate progress of the running job
  const startMs = new Date(runningJob.startedAt).getTime();
  const finishMs = new Date(runningJob.realFinishAt).getTime();
  const totalDuration = finishMs - startMs;
  const elapsed = Math.max(0, now - startMs);
  const completedFraction = Math.min(1, elapsed / totalDuration);

  // Calculate completed and remaining quantities
  const completedQty = Math.floor(runningJob.assignedQty * completedFraction);
  const remainingQty = runningJob.assignedQty - completedQty;

  // Create the High Priority job
  const highPriorityFactoryHours = order.quantity / targetMachine.speed;
  const highPriorityFinish = computeRealFinish(new Date(now), highPriorityFactoryHours);
  
  const highPriorityJob = buildJob({
    orderId: order.id,
    machineId: targetMachine.id,
    priority: order.priority,
    assignedQty: order.quantity,
    factoryHours: highPriorityFactoryHours,
    status: "running",
  });

  // Create the resumed portion of the interrupted job
  const remainingFactoryHours = remainingQty / targetMachine.speed;

  const resumedJob: QueuedJob = {
    jobId: `${runningJob.jobId}-resumed`,
    orderId: runningJob.orderId,
    machineId: runningJob.machineId,
    priority: runningJob.priority,
    assignedQty: remainingQty,
    estimatedHours: parseFloat(remainingFactoryHours.toFixed(2)), // Frozen duration for resume
    totalEstimatedHours: runningJob.totalEstimatedHours, // Keep original total
    startedAt: new Date(now).toISOString(), // Placeholder - will be recalculated on resume
    realFinishAt: new Date(now).toISOString(), // Placeholder - will be recalculated on resume
    status: "paused", // Ticker will call resumeNextIfPaused() to start it
  };

  // Build the new queue: Replace the running job with high-priority + resumed
  // The running job is at runningJobIndex, we replace it with 2 jobs:
  // 1. High-priority job (starts running immediately)
  // 2. Resumed job (paused, will auto-resume when high-priority completes)
  const newQueue = [
    highPriorityJob,
    resumedJob,
    ...targetMachine.queue.filter((_, idx) => idx !== runningJobIndex),
  ];

  // We don't have the original SLA deadline in the queue state, so we warn about the delay
  warnings.push(
    `WARNING: Preempted order ${runningJob.orderId} will be delayed by ${parseFloat(highPriorityFactoryHours.toFixed(2))} hours.`
  );

  // Create schedule result
  const task: ScheduledTask = {
    machineId: targetMachine.id,
    machineSpeed: targetMachine.speed,
    assignedQty: order.quantity,
    estimatedHours: parseFloat(highPriorityFactoryHours.toFixed(2)),
    estimatedFinish: highPriorityFinish.toISOString(),
  };

  const deadline = new Date(order.deadline);
  const diffMinutes = differenceInMinutes(deadline, highPriorityFinish);

  const scheduleResult: ScheduleResult = {
    orderId: order.id,
    tasks: [task],
    overallFinish: highPriorityFinish.toISOString(),
    slaStatus: diffMinutes >= 0 ? "SAFE" : "RISK",
    slaDiff: diffMinutes,
  };

  // Update machines
  const updatedMachines = allMachines.map((m) => {
    if (m.id === targetMachine.id) {
      return {
        ...m,
        status: "busy" as const,
        queue: newQueue,
      };
    }
    return m;
  });

  // Create preemption event
  preemptionEvents.push({
    machineId: targetMachine.id,
    bumpedOrderId: runningJob.orderId,
    bumpedJobId: runningJob.jobId,
    bumpedPriority: runningJob.priority,
    newOrderId: order.id,
    newJobId: highPriorityJob.jobId,
    newPriority: order.priority,
    reason: "preempted",
    bumpedProgressPercent: Math.round(completedFraction * 100),
  });

  warnings.push(
    `Paused ${runningJob.priority} Priority Order ${runningJob.orderId} at ${Math.round(completedFraction * 100)}% completion on ${targetMachine.id}.`
  );
  warnings.push(
    `Remaining ${remainingQty.toLocaleString()} sheets will resume after High Priority Order ${order.id} completes.`
  );

  return {
    success: true,
    scheduleResult,
    updatedMachines,
    warnings,
    preemptionEvents,
    passUsed: 3,
  };
}
