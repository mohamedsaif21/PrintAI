import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

export async function GET() {
    let { data: materials, error } = await supabase
        .from('materials')
        .select('*');

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!materials || materials.length === 0) {
        // Seed default materials
        const defaults = [
            { name: 'Coated Sheet', unit: 'sheets', total_stock: 50000, available_stock: 50000, threshold_level: 10000 },
            { name: 'Glossy Sheet', unit: 'sheets', total_stock: 40000, available_stock: 40000, threshold_level: 8000 },
            { name: 'Matte Sheet', unit: 'sheets', total_stock: 40000, available_stock: 40000, threshold_level: 8000 },
            { name: 'Uncoated Sheet', unit: 'sheets', total_stock: 60000, available_stock: 60000, threshold_level: 12000 }
        ];
        
        const { data: inserted, error: insertError } = await supabase
            .from('materials')
            .insert(defaults)
            .select();
            
        if (insertError) {
            console.error("Failed to seed default materials:", insertError);
        } else if (inserted) {
            materials = inserted;
            
            // Also seed the BOM table for default combinations!
            const products = ["Brochure", "Flyer", "Catalogue", "Poster", "Annual Report", "Business Card", "Newsletter"];
            const paperTypes = ["Coated", "Glossy", "Matte", "Uncoated"];
            
            const bomSeeds = [];
            for (const p of products) {
                for (let i = 0; i < paperTypes.length; i++) {
                    const pt = paperTypes[i];
                    const productId = `${p.toLowerCase().replace(' ', '_')}_${pt.toLowerCase()}`;
                    
                    // Match with inserted materials
                    const mat = materials.find(m => m.name.toLowerCase().startsWith(pt.toLowerCase()));
                    if (mat) {
                        bomSeeds.push({
                            product_id: productId,
                            material_id: mat.id,
                            quantity_per_unit: 1
                        });
                    }
                }
            }
            
            const { error: bomError } = await supabase
                .from('bom')
                .insert(bomSeeds);
                
            if (bomError) {
                console.error("Failed to seed BOM table:", bomError);
            }
        }
    }

    return NextResponse.json(materials || []);
}
