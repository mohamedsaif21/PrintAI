import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MACHINES, normaliseMachine } from "@/lib/scheduler";
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
  return normaliseMachine({
    id: row.id,
    speed: row.speed,
    capacity: row.capacity,
    status: row.status,
    paperTypes: row.paperTypes || row.paper_types || [],
    utilisation: row.utilisation,
    assignedOrderId: row.assignedOrderId || row.assigned_order_id,
    queue: row.queue || [],
  });
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("machines")
      .select("*")
      .order("id", { ascending: true });

    if (error || !data || data.length === 0) {
      const sortedDefaults = [...DEFAULT_MACHINES].sort((a, b) => a.id.localeCompare(b.id));
      return NextResponse.json({ machines: sortedDefaults });
    }

    const loaded = (data as MachineRow[]).map(toMachine);
    const sanitized = loaded.map((m) => {
      // If a machine has an empty queue and is not M2 (which gets seeded), it should be available/standby
      if (m.id !== "M2" && m.queue.length === 0 && m.status === "busy") {
        return {
          ...m,
          status: m.id === "M5" ? ("backup" as const) : ("available" as const),
          utilisation: 0,
          assignedOrderId: undefined,
        };
      }
      return m;
    });

    // Ensure strict ID sorting
    sanitized.sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ machines: sanitized });
  } catch {
    const sortedDefaults = [...DEFAULT_MACHINES].sort((a, b) => a.id.localeCompare(b.id));
    return NextResponse.json({ machines: sortedDefaults });
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
