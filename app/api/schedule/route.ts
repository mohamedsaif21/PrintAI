import { NextRequest, NextResponse } from "next/server";
import { dispatchScheduleToMachines, runScheduler, DEFAULT_MACHINES, normaliseMachine } from "@/lib/scheduler";
import { scheduleHighPriorityOrder } from "@/lib/highPriorityScheduler";
import { generateScheduleExplanation, analyseRisk } from "@/lib/gemini";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { validateData, CreateOrderSchema } from "@/lib/validation";
import { Machine, Order } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { addHours, isBefore } from "date-fns";

type MachineRow = Machine & {
  paper_types?: string[];
  assigned_order_id?: string;
  queue?: Machine["queue"];
};

function toMachine(row: MachineRow): Machine {
  return {
    id: row.id,
    speed: row.speed,
    capacity: row.capacity,
    status: row.status,
    paperTypes: row.paperTypes || row.paper_types || [],
    utilisation: row.utilisation,
    assignedOrderId: row.assignedOrderId || row.assigned_order_id,
    queue: row.queue || [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const currentMachines = Array.isArray(body.currentMachines)
      ? (body.currentMachines as Machine[]).map(normaliseMachine)
      : null;

    // Validate all incoming fields with zod schema
    const validation = validateData(CreateOrderSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { customer, product, quantity, paperType, priority, deadlineHours } = validation.data;

    // Calculate deadline as X hours from current time
    const now = new Date();
    const deadline = addHours(now, Number(deadlineHours));

    // Validate deadline is in the future (should always be true with positive deadlineHours)
    if (isBefore(deadline, now)) {
      return NextResponse.json({ 
        error: `Invalid deadline calculation. Deadline must be in the future.` 
      }, { status: 400 });
    }

    const order: Order = {
      id: `ORD-${uuidv4().slice(0, 6).toUpperCase()}`,
      customer,
      product,
      quantity: Number(quantity),
      paperType,
      priority,
      deadline: deadline.toISOString(),
      status: "Pending Approval",
      createdAt: new Date().toISOString(),
    };

    // Fetch machines from Supabase (or fall back to defaults)
    let machines = currentMachines || DEFAULT_MACHINES;
    try {
      const { data } = await supabase.from("machines").select("*");
      if (!currentMachines && data && data.length > 0) machines = (data as MachineRow[]).map(toMachine);
    } catch {
      // use defaults if Supabase not configured
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HIGH PRIORITY SCHEDULER: 3-Pass What-If Analysis
    // ═══════════════════════════════════════════════════════════════════════
    if (priority === "High") {
      const whatIfResult = scheduleHighPriorityOrder(order, machines);
      
      if (!whatIfResult.success) {
        // All 3 passes failed - return error with warnings
        return NextResponse.json({ 
          error: `Unable to schedule High Priority order. Attempts: ${whatIfResult.warnings.join(" | ")}` 
        }, { status: 400 });
      }

      // Success! Use the result from the successful pass
      const result = whatIfResult.scheduleResult!;
      const updatedMachines = whatIfResult.updatedMachines!;
      const preemptionEvents = whatIfResult.preemptionEvents;

      // Generate AI explanation
      const explanation = await generateScheduleExplanation(order, result);
      result.explanation = explanation;

      // Add pass info to explanation
      const passInfo = `\n\n[Pass ${whatIfResult.passUsed} used: ${whatIfResult.warnings[whatIfResult.warnings.length - 1]}]`;
      result.explanation = (result.explanation || "") + passInfo;

      // Run risk analysis
      result.risk = await analyseRisk(order, machines, result);

      // Save to Supabase
      if (isSupabaseConfigured()) {
        try {
          await supabase.from("orders").insert({
            id: order.id,
            customer: order.customer,
            product: order.product,
            quantity: order.quantity,
            paper_type: order.paperType,
            priority: order.priority,
            deadline: order.deadline,
            status: order.status,
            created_at: order.createdAt,
          });

          await supabase.from("schedules").insert({
            order_id: order.id,
            tasks: result.tasks,
            overall_finish: result.overallFinish,
            sla_status: result.slaStatus,
            sla_diff: result.slaDiff,
            explanation: result.explanation,
            created_at: new Date().toISOString(),
          });
        } catch (dbError) {
          console.error("Failed to persist order/schedule to database:", dbError);
        }
      }

      return NextResponse.json({ 
        order, 
        schedule: result, 
        machines: updatedMachines, 
        preemptionEvents,
        whatIfWarnings: whatIfResult.warnings,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NORMAL SCHEDULER: For Medium and Low Priority orders
    // ═══════════════════════════════════════════════════════════════════════
    // Run rule-based scheduler against the live machine queue/status state.
    const result = runScheduler(order, machines);

    // Generate AI explanation via Gemini
    const explanation = await generateScheduleExplanation(order, result);
    result.explanation = explanation;

    // Run SLA risk + anomaly analysis
    result.risk = await analyseRisk(order, machines, result);
    const { machines: updatedMachines, events: preemptionEvents } = dispatchScheduleToMachines(order, result, machines);

    // Save order and schedule to Supabase
    if (isSupabaseConfigured()) {
      try {
        await supabase.from("orders").insert({
          id: order.id,
          customer: order.customer,
          product: order.product,
          quantity: order.quantity,
          paper_type: order.paperType,
          priority: order.priority,
          deadline: order.deadline,
          status: order.status,
          created_at: order.createdAt,
        });

        await supabase.from("schedules").insert({
          order_id: order.id,
          tasks: result.tasks,
          overall_finish: result.overallFinish,
          sla_status: result.slaStatus,
          sla_diff: result.slaDiff,
          explanation: result.explanation,
          created_at: new Date().toISOString(),
        });
      } catch (dbError) {
        console.error("Failed to persist order/schedule to database:", dbError);
      }
    }

    return NextResponse.json({ order, schedule: result, machines: updatedMachines, preemptionEvents });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
