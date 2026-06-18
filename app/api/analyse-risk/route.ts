import { NextRequest, NextResponse } from "next/server";
import { analyseRisk } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MACHINES, normaliseMachine } from "@/lib/scheduler";
import { Order, ScheduleResult } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const { order, schedule } = await req.json();

    if (!order || !schedule) {
      return NextResponse.json({ error: "Both order and schedule are required." }, { status: 400 });
    }
    if (!order.deadline || !schedule.overallFinish) {
      return NextResponse.json({ error: "Order deadline and schedule overallFinish are required." }, { status: 400 });
    }
    if (!Array.isArray(schedule.tasks)) {
      return NextResponse.json({ error: "Schedule tasks must be an array." }, { status: 400 });
    }

    let machines = DEFAULT_MACHINES.map(normaliseMachine);
    try {
      const { data } = await supabase.from("machines").select("*");
      if (data && data.length > 0) machines = (data as typeof DEFAULT_MACHINES).map(normaliseMachine);
    } catch {}

    const analysis = await analyseRisk(order as Order, machines, schedule as ScheduleResult);
    return NextResponse.json(analysis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
