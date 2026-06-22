import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { InventoryService } from '@/lib/inventoryService';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
        // First, find all material reservations for this order
        const { data: usageData, error: usageError } = await supabase
            .from('material_usage')
            .select('material_id, required_qty')
            .eq('order_id', id)
            .eq('status', 'reserved');

        if (usageError) {
            throw new Error("Failed to fetch material usage");
        }

        // Release each reserved material
        for (const usage of usageData) {
            await InventoryService.releaseMaterial(usage.material_id, usage.required_qty, id);
        }

        // After releasing materials, delete the order itself
        const { error: deleteError } = await supabase
            .from('orders')
            .delete()
            .eq('id', id);

        if (deleteError) {
            throw new Error("Failed to delete order");
        }

        return new Response(null, { status: 204 });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
