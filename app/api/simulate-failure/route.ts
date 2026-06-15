import { NextRequest, NextResponse } from "next/server";
import { simulateBreakdown, DEFAULT_MACHINES } from "@/lib/scheduler";
import { generateFailureExplanation } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";
import { Order, ScheduledTask } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { failedMachineId, orderId, tasks, completedFraction = 0.5 } = await req.json();

    // #3 — clamp completedFraction to valid 0–1 range
    const fraction = Math.min(1, Math.max(0, Number(completedFraction)));

    // #6 — validate failedMachineId exists in the provided tasks
    if (tasks && Array.isArray(tasks) && !tasks.find((t: { machineId: string }) => t.machineId === failedMachineId)) {
      return NextResponse.json({ error: `Machine ${failedMachineId} is not part of the current schedule tasks.` }, { status: 400 });
    }

    // Fetch order
    let order: Order | null = null;
    try {
      const { data } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (data) order = { ...data, paperType: data.paper_type, createdAt: data.created_at };
    } catch {}

    // Fallback demo order
    if (!order) {
      order = {
        id: orderId || "ORD-DEMO",
        customer: "Demo Customer",
        product: "Brochure",
        quantity: 10000,
        paperType: "Coated",
        priority: "High",
        deadline: new Date(new Date().setHours(18, 0, 0, 0)).toISOString(),
        status: "In Progress",
        createdAt: new Date().toISOString(),
      };
    }

    const machines = DEFAULT_MACHINES;
    const originalTasks: ScheduledTask[] = tasks || [
      { machineId: "M1", machineSpeed: 500, assignedQty: 3000, estimatedHours: 6,   estimatedFinish: new Date(new Date().setHours(16, 0)).toISOString() },
      { machineId: "M3", machineSpeed: 600, assignedQty: 4000, estimatedHours: 6.67, estimatedFinish: new Date(new Date().setHours(16, 40)).toISOString() },
      { machineId: "M4", machineSpeed: 450, assignedQty: 3000, estimatedHours: 6.67, estimatedFinish: new Date(new Date().setHours(16, 40)).toISOString() },
    ];

    const { newTasks, result } = simulateBreakdown(
      failedMachineId,
      fraction,
      originalTasks,
      machines,
      order
    );

    const failedTask = originalTasks.find((t) => t.machineId === failedMachineId);
    const remainingQty = Math.round((failedTask?.assignedQty || 0) * (1 - fraction));
    const backupId = newTasks.find((t) => !originalTasks.find((o) => o.machineId === t.machineId))?.machineId || "M5";

    const explanation = await generateFailureExplanation(
      failedMachineId,
      backupId,
      remainingQty,
      result.slaStatus
    );

    return NextResponse.json({
      newTasks,
      result: { ...result, explanation },
      failedMachineId,
      backupMachineId: backupId,
      remainingQty,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
