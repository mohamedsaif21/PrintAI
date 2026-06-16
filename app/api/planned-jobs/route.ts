import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ScheduledTask } from "@/types";
import { PlannedJob } from "@/types/planned-jobs";

interface ScheduleOrderRow {
  customer: string;
  deadline: string;
  paper_type: string;
  priority?: "High" | "Medium" | "Low";
  product: string;
  quantity: number;
}

interface ScheduleRow {
  order_id: string;
  tasks: ScheduledTask[];
  orders: ScheduleOrderRow | null;
  sla_status: "SAFE" | "RISK";
  sla_diff: number;
  created_at: string;
}

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
    const rows = schedules as ScheduleRow[];
    const shiftLabel: PlannedJob["shift"] =
      shift === "Afternoon" ? "afternoon" : shift === "Night" ? "night" : "morning";
    const jobs = rows.flatMap((s): PlannedJob[] => {
      const order = s.orders;
      if (!order) return [];

      return (s.tasks || []).map((task, i) => {
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
          balance_value: task.assignedQty,
          cs_name: "—",
          wo_quantity: order.quantity,
          base_paper: order.paper_type,
          ed_date: order.deadline,
          production_type: order.product,
          pi_number: "",
          no_of_plates: 0,
          current_wc: task.machineId,
          line_count: i + 1,
          next_wc: i === s.tasks.length - 1 ? "Dispatch" : s.tasks[i + 1]?.machineId || "Dispatch",
          oos: false,
          stage: stageLabel,
          operator: "Unassigned",
          shift: shiftLabel,
          ai_suggestion: undefined,
          created_at: s.created_at,
        };
      });
    });

    // Apply stage filter
    const filtered = stage ? jobs.filter((j) => j.stage === stage) : jobs;

    const stats = {
      total: jobs.length,
      prePress: jobs.filter((j) => j.stage === "pre-press").length,
      press: jobs.filter((j) => j.stage === "press").length,
      postPress: jobs.filter((j) => j.stage === "post-press").length,
      atRisk: jobs.filter((j) => j.printing_status === "Error").length,
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
