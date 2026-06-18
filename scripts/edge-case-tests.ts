/**
 * Edge-case simulation runner — execute with: npx tsx scripts/edge-case-tests.ts
 */
import { runScheduler, simulateBreakdown, DEFAULT_MACHINES, normaliseMachine } from "../lib/scheduler";
import { scheduleHighPriorityOrder } from "../lib/highPriorityScheduler";
import { analyseRisk } from "../lib/gemini";
import { jobProgressPercent } from "../lib/timeEngine";
import { distributeQuantity, computeSlaStatus, clampProgress, toTimestamp } from "../lib/safeMath";
import { Order, Machine, ScheduleResult } from "../types";

type CaseResult = { name: string; pass: boolean; detail: string };

const results: CaseResult[] = [];

function check(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "PASS" : "FAIL";
  console.log(`[${icon}] ${name}: ${detail}`);
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ORD-TEST",
    customer: "Test Co",
    product: "Flyers",
    quantity: 1000,
    paperType: "Coated",
    priority: "Medium",
    deadline: new Date(Date.now() + 3_600_000).toISOString(),
    status: "Pending Approval",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function run() {
  console.log("\n=== PrintAI Edge Case Tests ===\n");

  // SCHEDULING: no machines available
  try {
    const allBreakdown = DEFAULT_MACHINES.map((m) => ({ ...m, status: "breakdown" as const }));
    runScheduler(makeOrder({ paperType: "Coated" }), allBreakdown);
    check("No machines available", false, "Expected throw");
  } catch (e) {
    check("No machines available", true, e instanceof Error ? e.message : "threw");
  }

  // SCHEDULING: no compatible paper type
  try {
    runScheduler(makeOrder({ paperType: "NonexistentPaper" }), DEFAULT_MACHINES);
    check("No compatible paper", false, "Expected throw");
  } catch {
    check("No compatible paper", true, "Correctly rejected");
  }

  // SCHEDULING: quantity distribution sums correctly
  const order = makeOrder({ quantity: 10001, paperType: "Coated" });
  const schedule = runScheduler(order, DEFAULT_MACHINES.map(normaliseMachine));
  const assignedSum = schedule.tasks.reduce((s, t) => s + t.assignedQty, 0);
  check("Quantity distribution", assignedSum === order.quantity, `assigned=${assignedSum}, expected=${order.quantity}`);

  // SCHEDULING: zero quantity
  try {
    runScheduler(makeOrder({ quantity: 0 }), DEFAULT_MACHINES);
    check("Zero quantity rejected", false, "Expected throw");
  } catch (e) {
    check("Zero quantity rejected", true, e instanceof Error ? e.message : "threw");
  }

  // SCHEDULING: large job stress
  const big = runScheduler(makeOrder({ quantity: 5_000_000, paperType: "Coated" }), DEFAULT_MACHINES);
  check("Large job stress", big.tasks.length > 0 && toTimestamp(big.overallFinish) !== null, `finish=${big.overallFinish}`);

  // SLA: already passed before scheduling
  const pastDeadline = runScheduler(
    makeOrder({ deadline: new Date(Date.now() - 60_000).toISOString() }),
    DEFAULT_MACHINES,
  );
  check("SLA already passed", pastDeadline.slaStatus === "RISK" && pastDeadline.slaDiff < 0, `status=${pastDeadline.slaStatus}, diff=${pastDeadline.slaDiff}`);

  // SLA: tight deadline (5 min)
  const tight = runScheduler(
    makeOrder({ deadline: new Date(Date.now() + 5 * 60_000).toISOString(), quantity: 50000 }),
    DEFAULT_MACHINES,
  );
  check("Tight deadline", tight.slaStatus === "RISK" || tight.slaDiff < 120, `status=${tight.slaStatus}, diff=${tight.slaDiff}`);

  // SLA: null/invalid overallFinish helper
  const invalidSla = computeSlaStatus(new Date().toISOString(), "not-a-date");
  check("Invalid finish date SLA", invalidSla.slaStatus === "SAFE" && invalidSla.slaDiff === 0, JSON.stringify(invalidSla));

  // PROGRESS: completed > total clamped
  const progress = clampProgress(1500, 1000);
  check("Progress clamp overflow", progress.completed === 1000 && progress.percent === 100, JSON.stringify(progress));

  // PROGRESS: total = 0
  const zeroProgress = clampProgress(0, 0);
  check("Progress zero total", zeroProgress.percent === 0, JSON.stringify(zeroProgress));

  // PROGRESS: jobProgressPercent zero duration
  const now = new Date();
  const sameTime = jobProgressPercent(now.toISOString(), now.toISOString());
  check("Zero duration progress", sameTime === 100 || sameTime === 0, `percent=${sameTime}`);

  // BREAKDOWN: mid-job with full completion
  const tasks = schedule.tasks;
  const breakdownFull = simulateBreakdown("M1", 1, tasks, DEFAULT_MACHINES, order);
  const backupTask = breakdownFull.newTasks.find((t) => t.machineId === "M5");
  check(
    "Breakdown 100% complete",
    !backupTask || backupTask.assignedQty === 0,
    backupTask ? `backup qty=${backupTask.assignedQty}` : "no backup task needed",
  );

  // BREAKDOWN: mid-job normal
  const breakdown = simulateBreakdown("M1", 0.5, tasks, DEFAULT_MACHINES, order);
  check("Breakdown mid-job", breakdown.newTasks.some((t) => t.machineId === "M5"), "Backup assigned");

  // RISK: deterministic fallback without API key
  const risk = await analyseRisk(order, DEFAULT_MACHINES, schedule);
  check(
    "Risk analysis fallback",
    Number.isFinite(risk.riskScore) && ["LOW", "MEDIUM", "HIGH"].includes(risk.riskLevel),
    `score=${risk.riskScore}, level=${risk.riskLevel}`,
  );

  // RISK: invalid schedule dates
  const badSchedule: ScheduleResult = {
    ...schedule,
    overallFinish: "invalid-date",
  };
  const badRisk = await analyseRisk(order, DEFAULT_MACHINES, badSchedule);
  check("Risk invalid finish", Number.isFinite(badRisk.riskScore), `score=${badRisk.riskScore}`);

  // HIGH PRIORITY: preemption path doesn't NaN
  const busyMachines: Machine[] = DEFAULT_MACHINES.map(normaliseMachine).map((m) => {
    if (m.id === "M1") {
      return {
        ...m,
        status: "busy" as const,
        queue: [
          {
            jobId: "j1",
            orderId: "ORD-LOW",
            machineId: "M1",
            priority: "Low" as const,
            assignedQty: 500,
            estimatedHours: 1,
            totalEstimatedHours: 1,
            startedAt: new Date().toISOString(),
            realFinishAt: new Date(Date.now() + 30_000).toISOString(),
            status: "running" as const,
          },
        ],
      };
    }
    return m;
  });
  const hp = scheduleHighPriorityOrder(makeOrder({ priority: "High", paperType: "Coated" }), busyMachines);
  check(
    "High priority preemption",
    hp.success && Number.isFinite(hp.scheduleResult?.slaDiff ?? NaN),
    `success=${hp.success}, pass=${hp.passUsed}`,
  );

  // DISTRIBUTE: remainder
  const shares = distributeQuantity(7, [500, 400, 450]);
  check("Distribute remainder", shares.reduce((a, b) => a + b, 0) === 7, shares.join(","));

  // MACHINE: normalise null queue
  const normalized = normaliseMachine({ ...DEFAULT_MACHINES[0], queue: undefined as unknown as [] });
  check("Normalise machine", Array.isArray(normalized.queue), `queue length=${normalized.queue.length}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== Summary: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length > 0) {
    console.log("\nFailed cases:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
