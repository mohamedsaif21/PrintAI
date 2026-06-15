import { NextRequest, NextResponse } from "next/server";
import { analyseRisk } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MACHINES } from "@/lib/scheduler";

export async function POST(req: NextRequest) {
  try {
    const { order, schedule } = await req.json();

    let machines = DEFAULT_MACHINES;
    try {
      const { data } = await supabase.from("machines").select("*");
      if (data && data.length > 0) machines = data;
    } catch {}

    const analysis = await analyseRisk(order, machines, schedule);
    return NextResponse.json(analysis);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
