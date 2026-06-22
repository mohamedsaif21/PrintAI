import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";

let MEMORY_MATERIALS = [
  { id: 1, name: 'Coated Sheet', unit: 'sheets', total_stock: 50000, available_stock: 50000, threshold_level: 10000 },
  { id: 2, name: 'Glossy Sheet', unit: 'sheets', total_stock: 40000, available_stock: 40000, threshold_level: 8000 },
  { id: 3, name: 'Matte Sheet', unit: 'sheets', total_stock: 40000, available_stock: 40000, threshold_level: 8000 },
  { id: 4, name: 'Uncoated Sheet', unit: 'sheets', total_stock: 60000, available_stock: 60000, threshold_level: 12000 }
];

export function updateMockMaterial(id: number, available_stock: number) {
  MEMORY_MATERIALS = MEMORY_MATERIALS.map(m => m.id === id ? { ...m, available_stock } : m);
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(MEMORY_MATERIALS);
  }

  try {
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      logError("Error fetching materials from Supabase", { error });
      throw new Error(error.message);
    }

    const hasData = data && data.length > 0;
    
    // Auto-replenish stock to full capacity (available_stock = total_stock) for demo purposes
    if (hasData) {
      const updates = data.map(async (mat) => {
        if (mat.available_stock !== mat.total_stock) {
          await supabase
            .from("materials")
            .update({ available_stock: mat.total_stock })
            .eq("id", mat.id);
          mat.available_stock = mat.total_stock;
        }
      });
      await Promise.all(updates);
    }

    return NextResponse.json(hasData ? data : MEMORY_MATERIALS);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
    logError("API error in /api/materials, falling back to mock materials", { error: errorMessage });
    return NextResponse.json(MEMORY_MATERIALS);
  }
}