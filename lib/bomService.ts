import { isSupabaseConfigured, supabase } from './supabase';
import { logError } from './logger';

export interface BomItem {
    material_id: number;
    quantity_per_unit: number;
}

export class BomService {

    /**
     * Retrieves the Bill of Materials (BOM) for a given product.
     * @param productId - The ID of the product.
     * @returns A promise that resolves to an array of BOM items.
     */
    static async getBomForProduct(productId: string): Promise<BomItem[]> {
        if (!isSupabaseConfigured()) {
            // Determine material_id based on the suffix of the productId
            // e.g. brochure_coated -> material 1
            // brochure_glossy -> material 2
            // brochure_matte -> material 3
            // brochure_uncoated -> material 4
            let material_id = 1;
            if (productId.endsWith('_glossy')) material_id = 2;
            else if (productId.endsWith('_matte')) material_id = 3;
            else if (productId.endsWith('_uncoated')) material_id = 4;

            return [{
                material_id,
                quantity_per_unit: 1
            }];
        }

        try {
            const { data, error } = await supabase
                .from('bom')
                .select('material_id, quantity_per_unit')
                .eq('product_id', productId);

            if (error) {
                logError("Error fetching BOM for product:", { error, productId });
                return [];
            }

            return data || [];
        } catch (err) {
            logError("Exception fetching BOM for product:", { err, productId });
            return [];
        }
    }
}
