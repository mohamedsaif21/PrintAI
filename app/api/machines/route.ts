import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DEFAULT_MACHINES } from "@/lib/scheduler";

export async function GET() {
  try {
    const { data, error } = await supabase.from("machines").select("*");
    if (error || !data || data.length === 0) {
      return NextResponse.json({ machines: DEFAULT_MACHINES });
    }
    return NextResponse.json({ machines: data });
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
