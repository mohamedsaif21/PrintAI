import { Machine, QueuedJob, PreemptionEvent, Priority } from "@/types";
import { computeRealFinish, remainingFactoryHours, jobProgressPercent } from "@/lib/timeEngine";
import { v4 as uuidv4 } from "uuid";

// Priority ranking — higher number wins
const PRIORITY_RANK: Record<Priority, number> = { High: 3, Medium: 2, Low: 1 };

export function priorityBeats(a: Priority, b: Priority): boolean {
  return PRIORITY_RANK[a] > PRIORITY_RANK[b];
}

export function priorityEquals(a: Priority, b: Priority): boolean {
  return PRIORITY_RANK[a] === PRIORITY_RANK[b];
}

/**
 * Pauses a running job in place: freezes its remaining factory-hours so it can
 * resume later without losing or gaining progress. The job's status becomes
 * "paused" and it goes to the FRONT of the queue (so it resumes next, before
 * any other already-queued jobs) once the machine frees up.
 */
function pauseJob(job: QueuedJob): QueuedJob {
  const remaining = remainingFactoryHours(job.startedAt, job.realFinishAt);
  return {
    ...job,
    status: "paused",
    estimatedHours: parseFloat(remaining.toFixed(2)), // remaining duration, frozen
  };
}

/**
 * Resumes a paused job: gives it a fresh startedAt = now, and recomputes
 * realFinishAt based on its frozen remaining estimatedHours.
 */
function resumeJob(job: QueuedJob): QueuedJob {
  const startedAt = new Date();
  const realFinishAt = computeRealFinish(startedAt, job.estimatedHours);
  return {
    ...job,
    status: "running",
    startedAt: startedAt.toISOString(),
    realFinishAt: realFinishAt.toISOString(),
  };
}

/**
 * Builds a fresh QueuedJob for a newly scheduled task.
 */
export function buildJob(params: {
  orderId: string;
  machineId: string;
  priority: Priority;
  assignedQty: number;
  factoryHours: number;
  status: QueuedJob["status"];
}): QueuedJob {
  const startedAt = new Date();
  const realFinishAt = computeRealFinish(startedAt, params.factoryHours);
  return {
    jobId: uuidv4().slice(0, 8),
    orderId: params.orderId,
    machineId: params.machineId,
    priority: params.priority,
    assignedQty: params.assignedQty,
    estimatedHours: parseFloat(params.factoryHours.toFixed(2)),
    totalEstimatedHours: parseFloat(params.factoryHours.toFixed(2)),
    startedAt: startedAt.toISOString(),
    realFinishAt: realFinishAt.toISOString(),
    status: params.status,
  };
}

/**
 * Core conflict-resolution logic. Call this when a new job WANTS to run on a
 * machine that is currently busy with another running job.
 *
 * Rules (as specified):
 * 1. New priority HIGHER than current running job's priority
 *      -> current job is PAUSED (keeps its place at front of queue, resumes
 *         later with no progress lost), new job starts running immediately.
 * 2. New priority LOWER than current running job's priority
 *      -> new job is queued normally behind the current running job.
 * 3. SAME priority (the tricky case: e.g. both High)
 *      -> compare % progress. Whichever job has MORE progress stays running
 *         on this machine. The other one (usually the new job, since it has
 *         0% progress) is redirected to the backup machine M5 instead of
 *         waiting in queue.
 *
 * Returns the updated target machine, optionally an updated backup machine
 * (M5) if rule 3 triggered an overflow, and a PreemptionEvent for the UI/notifications.
 */
export function resolveMachineConflict(
  targetMachine: Machine,
  backupMachine: Machine | undefined,
  newJob: QueuedJob
): {
  updatedTargetMachine: Machine;
  updatedBackupMachine?: Machine;
  event?: PreemptionEvent;
} {
  const currentJob = targetMachine.queue[0];

  // No running job on this machine — nothing to resolve, just attach normally.
  if (!currentJob || currentJob.status !== "running") {
    return {
      updatedTargetMachine: {
        ...targetMachine,
        queue: [...targetMachine.queue, { ...newJob, status: "running" }],
        status: "busy",
      },
    };
  }

  // ── Rule 3: SAME priority — compare progress, loser overflows to M5 ──────
  if (priorityEquals(newJob.priority, currentJob.priority)) {
    const currentProgress = jobProgressPercent(currentJob.startedAt, currentJob.realFinishAt);
    // New job always starts at 0% progress since it hasn't run yet.
    const newProgress = 0;

    if (currentProgress >= newProgress) {
      // Current job stays on the machine. New job overflows to backup M5.
      if (!backupMachine) {
        // No backup available — fall back to queueing behind (best effort).
        return {
          updatedTargetMachine: {
            ...targetMachine,
            queue: [...targetMachine.queue, { ...newJob, status: "queued" }],
          },
        };
      }

      const overflowJob = buildJob({
        orderId: newJob.orderId,
        machineId: backupMachine.id,
        priority: newJob.priority,
        assignedQty: newJob.assignedQty,
        factoryHours: newJob.totalEstimatedHours,
        status: backupMachine.queue.length === 0 ? "running" : "queued",
      });

      const updatedBackupMachine: Machine = {
        ...backupMachine,
        status: backupMachine.queue.length === 0 ? "busy" : backupMachine.status,
        queue: [...backupMachine.queue, overflowJob],
      };

      return {
        updatedTargetMachine: targetMachine, // unchanged — current job keeps running
        updatedBackupMachine,
        event: {
          machineId: targetMachine.id,
          bumpedOrderId: newJob.orderId,
          bumpedJobId: newJob.jobId,
          bumpedPriority: newJob.priority,
          newOrderId: newJob.orderId,
          newJobId: overflowJob.jobId,
          newPriority: newJob.priority,
          reason: "overflow-to-backup",
          bumpedProgressPercent: 0,
        },
      };
    } else {
      // (Edge case, practically unreachable since new job is always 0%):
      // the *new* job would have more progress — keep new job running, pause current.
      const paused = pauseJob(currentJob);
      return {
        updatedTargetMachine: {
          ...targetMachine,
          queue: [{ ...newJob, status: "running" }, paused, ...targetMachine.queue.slice(1)],
        },
        event: {
          machineId: targetMachine.id,
          bumpedOrderId: currentJob.orderId,
          bumpedJobId: currentJob.jobId,
          bumpedPriority: currentJob.priority,
          newOrderId: newJob.orderId,
          newJobId: newJob.jobId,
          newPriority: newJob.priority,
          reason: "preempted",
          bumpedProgressPercent: currentProgress,
        },
      };
    }
  }

  // ── Rule 1: NEW priority is HIGHER — preempt (pause current, run new) ────
  if (priorityBeats(newJob.priority, currentJob.priority)) {
    const pausedCurrent = pauseJob(currentJob);
    const progress = jobProgressPercent(currentJob.startedAt, currentJob.realFinishAt);

    return {
      updatedTargetMachine: {
        ...targetMachine,
        status: "busy",
        // New job runs now; paused job goes to FRONT of the remaining queue
        // so it resumes immediately after the new (higher priority) job finishes.
        queue: [{ ...newJob, status: "running" }, pausedCurrent, ...targetMachine.queue.slice(1)],
      },
      event: {
        machineId: targetMachine.id,
        bumpedOrderId: currentJob.orderId,
        bumpedJobId: currentJob.jobId,
        bumpedPriority: currentJob.priority,
        newOrderId: newJob.orderId,
        newJobId: newJob.jobId,
        newPriority: newJob.priority,
        reason: "preempted",
        bumpedProgressPercent: progress,
      },
    };
  }

  // ── Rule 2: NEW priority is LOWER — queue normally behind current job ────
  return {
    updatedTargetMachine: {
      ...targetMachine,
      queue: [...targetMachine.queue, { ...newJob, status: "queued" }],
    },
  };
}

/**
 * When a machine frees up (its running job finished) and the next item in
 * queue is a PAUSED job, this resumes it properly (fresh startedAt + recomputed
 * realFinishAt from its frozen remaining hours).
 */
export function resumeNextIfPaused(queue: QueuedJob[]): QueuedJob[] {
  if (queue.length === 0) return queue;
  if (queue[0].status === "paused") {
    return [resumeJob(queue[0]), ...queue.slice(1)];
  }
  return queue;
}
