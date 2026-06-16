import { NextRequest, NextResponse } from "next/server";
import { dispatchScheduleToMachines, runScheduler, DEFAULT_MACHINES, normaliseMachine } from "@/lib/scheduler";
import { generateScheduleExplanation, analyseRisk } from "@/lib/gemini";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { validateData, CreateOrderSchema } from "@/lib/validation";
import { Machine, Order, ScheduledTask } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { addHours, startOfDay, isBefore } from "date-fns";

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

    // #5 — validate all incoming fields with zod schema
    const validation = validateData(CreateOrderSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const { customer, product, quantity, paperType, priority, deadlineHour } = validation.data;

    // Build deadline as today at deadlineHour
    const deadline = addHours(startOfDay(new Date()), Number(deadlineHour));

    // #1 — reject deadlines already in the past
    if (isBefore(deadline, new Date())) {
      return NextResponse.json({ error: `Deadline hour ${deadlineHour}:00 has already passed today. Please choose a future hour.` }, { status: 400 });
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

    // Fetch existing schedules to calculate machine availability (queueing)
    const machineAvailability: Record<string, Date> = {};
    try {
      // Query uncompleted tasks from schedules
      const { data: schedulesData } = await supabase.from("schedules").select("tasks");
      if (schedulesData) {
        schedulesData.forEach((row) => {
          const tasks = row.tasks as ScheduledTask[];
          tasks.forEach((t) => {
            const finishDate = new Date(t.estimatedFinish);
            // Track the furthest finish time into the future for each machine
            if (!machineAvailability[t.machineId] || finishDate > machineAvailability[t.machineId]) {
              machineAvailability[t.machineId] = finishDate;
            }
          });
        });
      }
    } catch {
      // Fall back to empty availability if fetch fails, behaving as if machines are free
    }

    // Run rule-based scheduler
    const result = runScheduler(order, machines, machineAvailability);

    // Generate AI explanation via Gemini
    const explanation = await generateScheduleExplanation(order, result);
    result.explanation = explanation;

    // Run SLA risk + anomaly analysis
    result.risk = await analyseRisk(order, machines, result);
    const updatedMachines = dispatchScheduleToMachines(order, result, machines);

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

    return NextResponse.json({ order, schedule: result, machines: updatedMachines });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
