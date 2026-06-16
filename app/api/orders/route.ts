import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Order } from "@/types";

type OrderRow = {
  id: string;
  customer: string;
  product: string;
  quantity: number;
  paper_type?: string;
  paperType?: string;
  priority: Order["priority"];
  deadline: string;
  status: Order["status"];
  created_at?: string;
  createdAt?: string;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customer: row.customer,
    product: row.product,
    quantity: row.quantity,
    paperType: row.paperType || row.paper_type || "Coated",
    priority: row.priority,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ orders: ((data || []) as OrderRow[]).map(toOrder) });
  } catch {
    // Return seed data if Supabase not set up
    return NextResponse.json({
      orders: [
        { id: "ORD-1001", customer: "PrintCo Ltd",   product: "Brochure",      quantity: 10000, paperType: "Coated",  priority: "High",   deadline: new Date(new Date().setHours(18,0,0,0)).toISOString(), status: "Pending Approval", createdAt: new Date().toISOString() },
        { id: "ORD-1002", customer: "Bright Media",  product: "Flyer",         quantity: 8000,  paperType: "Glossy",  priority: "Medium", deadline: new Date(new Date().setHours(20,0,0,0)).toISOString(), status: "Scheduled",   createdAt: new Date().toISOString() },
        { id: "ORD-1003", customer: "Vega Corp",     product: "Annual Report", quantity: 5000,  paperType: "Matte",   priority: "High",   deadline: new Date(new Date().setHours(17,0,0,0)).toISOString(), status: "In Progress", createdAt: new Date().toISOString() },
        { id: "ORD-1004", customer: "Acme Retail",   product: "Catalogue",     quantity: 10000, paperType: "Coated",  priority: "Low",    deadline: new Date(new Date().setHours(21,0,0,0)).toISOString(), status: "Pending",     createdAt: new Date().toISOString() },
      ],
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
