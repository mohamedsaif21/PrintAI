import { NextRequest, NextResponse } from "next/server";
import { runScheduler, DEFAULT_MACHINES } from "@/lib/scheduler";
import { generateScheduleExplanation } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";
import { Order } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { addHours, startOfDay } from "date-fns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { customer, product, quantity, paperType, priority, deadlineHour } = body;

    // Build deadline as today at deadlineHour
    const deadline = addHours(startOfDay(new Date()), Number(deadlineHour));

    const order: Order = {
      id: `ORD-${uuidv4().slice(0, 6).toUpperCase()}`,
      customer,
      product,
      quantity: Number(quantity),
      paperType,
      priority,
      deadline: deadline.toISOString(),
      status: "Scheduled",
      createdAt: new Date().toISOString(),
    };

    // Fetch machines from Supabase (or fall back to defaults)
    let machines = DEFAULT_MACHINES;
    try {
      const { data } = await supabase.from("machines").select("*");
      if (data && data.length > 0) machines = data;
    } catch {
      // use defaults if Supabase not configured
    }

    // Run rule-based scheduler
    const result = runScheduler(order, machines);

    // Generate AI explanation via Gemini
    const explanation = await generateScheduleExplanation(order, result);
    result.explanation = explanation;

    // Save order and schedule to Supabase
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
    } catch {
      // Continue even if Supabase save fails
    }

    return NextResponse.json({ order, schedule: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("schedules")
      .select("*, orders(*)")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ schedules: [] });
    return NextResponse.json({ schedules: data || [] });
  } catch {
    return NextResponse.json({ schedules: [] });
  }
}
