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

  // ── NEW EDGE CASES ──────────────────────────────────────────────────────

  // SAFEMATH: clamp with NaN returns min
  const { clamp: clampFn, safeDivide: safeDivideFn, safeFactoryHours: safeFactoryHoursFn, maxTimestamp: maxTimestampFn, computeSlaDiffMinutes } = await import("../lib/safeMath");
  const clampNaN = clampFn(NaN, 0, 100);
  check("Clamp NaN returns min", clampNaN === 0, `result=${clampNaN}`);

  // SAFEMATH: clamp with Infinity
  const clampInf = clampFn(Infinity, 0, 100);
  check("Clamp Infinity returns min", clampInf === 0, `result=${clampInf}`);

  // SAFEMATH: safeDivide by zero returns fallback
  const divZero = safeDivideFn(100, 0, -1);
  check("SafeDivide by zero", divZero === -1, `result=${divZero}`);

  // SAFEMATH: safeDivide with NaN numerator
  const divNaN = safeDivideFn(NaN, 10, 42);
  check("SafeDivide NaN numerator", divNaN === 42, `result=${divNaN}`);

  // SAFEMATH: safeFactoryHours with zero speed floors to 1
  const zeroSpeedHours = safeFactoryHoursFn(1000, 0);
  check("SafeFactoryHours zero speed", zeroSpeedHours === 1000, `result=${zeroSpeedHours}`);

  // SAFEMATH: safeFactoryHours with negative qty clamps to 0
  const negQtyHours = safeFactoryHoursFn(-500, 100);
  check("SafeFactoryHours negative qty", negQtyHours === 0, `result=${negQtyHours}`);

  // SAFEMATH: maxTimestamp with all null returns null
  const maxNull = maxTimestampFn(null, undefined, null);
  check("MaxTimestamp all null", maxNull === null, `result=${maxNull}`);

  // SAFEMATH: maxTimestamp picks the latest
  const t1 = "2026-01-01T00:00:00Z";
  const t2 = "2026-06-15T12:00:00Z";
  const t3 = "2026-03-10T06:00:00Z";
  const maxTs = maxTimestampFn(t1, t2, t3);
  check("MaxTimestamp picks latest", maxTs === new Date(t2).getTime(), `result=${maxTs}`);

  // SAFEMATH: computeSlaDiffMinutes with both null
  const slaDiffNull = computeSlaDiffMinutes(null, null);
  check("SLA diff both null", slaDiffNull === 0, `result=${slaDiffNull}`);

  // SAFEMATH: distributeQuantity with empty weights
  const emptyDistribute = distributeQuantity(100, []);
  check("Distribute empty weights", emptyDistribute.length === 0, `result=[${emptyDistribute}]`);

  // SAFEMATH: distributeQuantity with zero total
  const zeroDistribute = distributeQuantity(0, [100, 200]);
  check("Distribute zero qty", zeroDistribute.every(s => s === 0), `result=[${zeroDistribute}]`);

  // TIME ENGINE: factoryHoursToRealMs and roundtrip
  const { factoryHoursToRealMs, realMsToFactoryHours, isJobFinished: isJobFinishedFn, remainingFactoryHours: remainingFHFn } = await import("../lib/timeEngine");
  const realMs = factoryHoursToRealMs(2);
  const roundtrip = realMsToFactoryHours(realMs);
  check("Time engine roundtrip", Math.abs(roundtrip - 2) < 0.001, `input=2h, roundtrip=${roundtrip}`);

  // TIME ENGINE: factoryHoursToRealMs negative input clamps to 0
  const negMs = factoryHoursToRealMs(-5);
  check("FactoryHours negative clamps to 0", negMs === 0, `result=${negMs}`);

  // TIME ENGINE: isJobFinished for past time
  const pastFinish = isJobFinishedFn(new Date(Date.now() - 10_000).toISOString());
  check("IsJobFinished past time", pastFinish === true, `result=${pastFinish}`);

  // TIME ENGINE: isJobFinished for future time
  const futureFinish = isJobFinishedFn(new Date(Date.now() + 60_000).toISOString());
  check("IsJobFinished future time", futureFinish === false, `result=${futureFinish}`);

  // TIME ENGINE: remainingFactoryHours for already-finished job
  const finishedRemaining = remainingFHFn(
    new Date(Date.now() - 120_000).toISOString(),
    new Date(Date.now() - 60_000).toISOString()
  );
  check("RemainingFactoryHours finished job", finishedRemaining === 0, `result=${finishedRemaining}`);

  // PRIORITY ENGINE: priorityBeats
  const { priorityBeats: pBeats, priorityEquals: pEquals, resumeNextIfPaused } = await import("../lib/priorityEngine");
  check("PriorityBeats High > Low", pBeats("High", "Low") === true, `result=${pBeats("High", "Low")}`);
  check("PriorityBeats Low < High", pBeats("Low", "High") === false, `result=${pBeats("Low", "High")}`);
  check("PriorityEquals Medium=Medium", pEquals("Medium", "Medium") === true, `result=${pEquals("Medium", "Medium")}`);
  check("PriorityEquals High!=Low", pEquals("High", "Low") === false, `result=${pEquals("High", "Low")}`);

  // PRIORITY ENGINE: resumeNextIfPaused empty queue
  const emptyQueue = resumeNextIfPaused([]);
  check("ResumeNext empty queue", emptyQueue.length === 0, `length=${emptyQueue.length}`);

  // SCHEDULING: negative quantity rejected
  try {
    runScheduler(makeOrder({ quantity: -100 }), DEFAULT_MACHINES);
    check("Negative quantity rejected", false, "Expected throw");
  } catch (e) {
    check("Negative quantity rejected", true, e instanceof Error ? e.message : "threw");
  }

  // SCHEDULING: single machine (only M1 available, rest breakdown)
  const singleMachineList = DEFAULT_MACHINES.map((m) => ({
    ...m,
    status: (m.id === "M1" ? "available" : "breakdown") as Machine["status"],
  }));
  const singleResult = runScheduler(makeOrder({ quantity: 5000, paperType: "Coated" }), singleMachineList);
  check("Single machine scheduling", singleResult.tasks.length === 1 && singleResult.tasks[0].machineId === "M1", `machines=${singleResult.tasks.map(t => t.machineId).join(",")}`);

  // HIGH PRIORITY: non-High priority order rejected by highPriorityScheduler
  const nonHigh = scheduleHighPriorityOrder(makeOrder({ priority: "Medium" }), DEFAULT_MACHINES);
  check("High priority scheduler rejects Medium", nonHigh.success === false, `success=${nonHigh.success}`);

  // SCHEDULING: minimum quantity (100 sheets)
  const minOrder = runScheduler(makeOrder({ quantity: 100, paperType: "Coated" }), DEFAULT_MACHINES);
  const minSum = minOrder.tasks.reduce((s, t) => s + t.assignedQty, 0);
  check("Minimum quantity 100 sheets", minSum === 100 && minOrder.tasks.length > 0, `assigned=${minSum}, tasks=${minOrder.tasks.length}`);

  // PROGRESS: clampProgress negative completed
  const negProgress = clampProgress(-50, 100);
  check("Progress negative completed", negProgress.completed === 0 && negProgress.percent === 0, JSON.stringify(negProgress));

  // NORMALISE: null machine returns default
  const nullMachine = normaliseMachine(null as unknown as Machine);
  check("Normalise null machine", nullMachine.id === "M1" && Array.isArray(nullMachine.queue), `id=${nullMachine.id}`);

  // MATERIALS RESTOCK: PUT clamp negative available stock to 0
  const { PUT: materialsPut } = await import("../app/api/materials/[id]/route");
  const { GET: materialsGet } = await import("../app/api/materials/route");
  
  const reqNeg = new Request("http://localhost/api/materials/1", {
    method: "PUT",
    body: JSON.stringify({ name: "Coated Sheet", total_stock: 50000, available_stock: -5000 })
  });
  const resNeg = await materialsPut(reqNeg, { params: Promise.resolve({ id: "1" }) });
  const getRes = await materialsGet();
  const getData = await getRes.json();
  const material1 = getData.find((m: any) => m.id === 1);
  check("Materials PUT clamp negative", material1.available_stock === 0, `available_stock=${material1.available_stock}`);

  // MATERIALS RESTOCK: PUT clamp overflow stock to total_stock
  const reqOver = new Request("http://localhost/api/materials/1", {
    method: "PUT",
    body: JSON.stringify({ name: "Coated Sheet", total_stock: 50000, available_stock: 999999 })
  });
  await materialsPut(reqOver, { params: Promise.resolve({ id: "1" }) });
  const getRes2 = await materialsGet();
  const getData2 = await getRes2.json();
  const material1Over = getData2.find((m: any) => m.id === 1);
  check("Materials PUT clamp overflow", material1Over.available_stock === 50000, `available_stock=${material1Over.available_stock}`);

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
