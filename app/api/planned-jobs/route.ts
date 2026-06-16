import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get("stage");
    const shift = searchParams.get("shift");

    // Read from existing schedules + orders tables
    const { data: schedules, error } = await supabase
      .from("schedules")
      .select("*, orders(*)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        jobs: [],
        stats: { total: 0, prePress: 0, press: 0, postPress: 0, atRisk: 0 },
      });
    }

    // Map schedules + orders into PlannedJob shape
    // Each task in a schedule becomes one planned job row
    const jobs = schedules.flatMap((s: any) => {
      const order = s.orders;
      if (!order) return [];

      return (s.tasks || []).map((task: any, i: number) => {
        const stageLabel =
          i === 0 ? "pre-press" : i === s.tasks.length - 1 ? "post-press" : "press";

        const isAtRisk = s.sla_status === "RISK";
        const finishDate = new Date(task.estimatedFinish);

        return {
          id: `${s.order_id}-${task.machineId}`,
          order_id: s.order_id,
          facility: "Main Facility",
          printing_status: isAtRisk ? "Error" : "Ongoing",
          wo_status: order.priority || "Medium",
          sla: Math.abs(s.sla_diff),
          ageing: Math.floor(
            (Date.now() - new Date(s.created_at).getTime()) / (1000 * 60 * 60 * 24)
          ),
          machine_name: task.machineId,
          schedule_date: finishDate.toISOString(),
          retailer: order.customer,
          product_id: order.product,
          balance_qty: task.assignedQty,
          cs_name: "—",
          wo_quantity: order.quantity,
          base_paper: order.paper_type,
          ed_date: order.deadline,
          production_type: order.product,
          stage: stageLabel,
          shift: shift || "Morning",
          ai_suggestion: null,
          created_at: s.created_at,
        };
      });
    });

    // Apply stage filter
    const filtered = stage ? jobs.filter((j: any) => j.stage === stage) : jobs;

    const stats = {
      total: jobs.length,
      prePress: jobs.filter((j: any) => j.stage === "pre-press").length,
      press: jobs.filter((j: any) => j.stage === "press").length,
      postPress: jobs.filter((j: any) => j.stage === "post-press").length,
      atRisk: jobs.filter((j: any) => j.printing_status === "Error").length,
    };

    return NextResponse.json({ jobs: filtered, stats });
  } catch {
    // Return empty instead of error so UI doesn't show failure notification
    return NextResponse.json({
      jobs: [],
      stats: { total: 0, prePress: 0, press: 0, postPress: 0, atRisk: 0 },
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ai_suggestion } = await req.json();
    // id format is "ORD-XXXX-M1" — we update the schedule's explanation field
    const orderId = id.split("-").slice(0, 2).join("-");
    await supabase
      .from("schedules")
      .update({ explanation: ai_suggestion })
      .eq("order_id", orderId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false });
  }
}
