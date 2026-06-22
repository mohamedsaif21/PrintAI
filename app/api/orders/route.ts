import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Order } from '@/types';
import { BomService } from '@/lib/bomService';
import { InventoryService } from '@/lib/inventoryService';

type OrderRow = {
  id: string;
  customer: string;
  product: string;
  quantity: number;
  paper_type?: string;
  paperType?: string;
  priority: Order['priority'];
  deadline: string;
  status: Order['status'];
  created_at?: string;
  createdAt?: string;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customer: row.customer,
    product: row.product,
    quantity: row.quantity,
    paperType: row.paperType || row.paper_type || 'Coated',
    priority: row.priority,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ orders: ((data || []) as OrderRow[]).map(toOrder) });
  } catch (error: unknown) {
    console.error('Failed to fetch orders from database:', error);
    // Return empty array - no seed data fallback
    // This forces proper Supabase configuration
    return NextResponse.json({ 
      orders: [],
      message: 'No orders found. Create your first order to get started.'
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json();
    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) throw error;

    if (status === 'Completed') {
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .select('product, quantity, paper_type')
            .eq('id', id)
            .single();

        if (orderError || !orderData) {
            console.error("Could not find order to consume materials.");
        } else {
            const { product, quantity, paper_type: paperType } = orderData;
            const productId = `${product.toLowerCase().replace(' ', '_')}_${paperType.toLowerCase()}`;
            const bom = await BomService.getBomForProduct(productId);

            for (const item of bom) {
                const consumedQuantity = item.quantity_per_unit * quantity;
                await InventoryService.consumeMaterial(item.material_id, consumedQuantity, id);
            }
        }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
