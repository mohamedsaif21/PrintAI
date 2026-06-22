import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { updateMockMaterial } from '../route';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const { name, unit, total_stock, available_stock, threshold_level } = await request.json();

    const clampedAvailable = Math.min(total_stock || 1000000, Math.max(0, available_stock || 0));

    if (!isSupabaseConfigured()) {
        updateMockMaterial(Number(id), clampedAvailable);
        return NextResponse.json([{ id: Number(id), name, unit, total_stock, available_stock: clampedAvailable, threshold_level }]);
    }

    const { data, error } = await supabase
         .from('materials')
         .update({ name, unit, total_stock, available_stock: clampedAvailable, threshold_level, updated_at: new Date() })
         .eq('id', id)
         .select();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    const { error } = await supabase
        .from('materials')
        .delete()
        .eq('id', id);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new Response(null, { status: 204 });
}
