import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MACHINES } from "@/lib/scheduler";
import { Machine } from "@/types";

type MachineRow = {
  id: string;
  speed: number;
  capacity: number;
  status: Machine["status"];
  paper_types?: string[];
  paperTypes?: string[];
  utilisation: number;
  assigned_order_id?: string;
  assignedOrderId?: string;
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

export async function GET() {
  try {
    const { data, error } = await supabase.from("machines").select("*");
    if (error || !data || data.length === 0) {
      return NextResponse.json({ machines: DEFAULT_MACHINES });
    }
    return NextResponse.json({ machines: (data as MachineRow[]).map(toMachine) });
  } catch {
    return NextResponse.json({ machines: DEFAULT_MACHINES });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, utilisation } = await req.json();
    const update: Record<string, unknown> = {};
    if (status !== undefined) update.status = status;
    if (utilisation !== undefined) update.utilisation = utilisation;

    const { error } = await supabase.from("machines").update(update).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
