import { isSupabaseConfigured, supabase } from './supabase';
import { logError } from './logger';

export class InventoryService {
    /**
     * Checks if a material has sufficient available stock.
     */
    static async checkAvailability(materialId: number, quantity: number): Promise<boolean> {
        if (!isSupabaseConfigured()) {
            // Default mock stock is high enough to satisfy scheduling requests in development
            return true;
        }

        try {
            const { data, error } = await supabase
                .from('materials')
                .select('available_stock')
                .eq('id', materialId)
                .single();

            if (error || !data) {
                console.error(`Error checking availability for material ${materialId}:`, error);
                return false;
            }

            return data.available_stock >= quantity;
        } catch (err) {
            console.error(`Exception in checkAvailability for material ${materialId}:`, err);
            return false;
        }
    }

    /**
     * Reserves stock for an order using the reserve_material database RPC.
     */
    static async reserveMaterial(materialId: number, quantity: number, orderId: string): Promise<void> {
        if (!isSupabaseConfigured()) {
            return;
        }

        const { error } = await supabase.rpc('reserve_material', {
            p_material_id: materialId,
            p_quantity: quantity,
            p_order_id: orderId
        });

        if (error) {
            logError(error, { materialId, quantity, orderId, action: 'reserveMaterial' });
            throw new Error(`Failed to reserve material: ${error.message}`);
        }
    }

    /**
     * Consumes stock for an order using the consume_material database RPC.
     */
    static async consumeMaterial(materialId: number, quantity: number, orderId: string): Promise<void> {
        if (!isSupabaseConfigured()) {
            return;
        }

        const { error } = await supabase.rpc('consume_material', {
            p_material_id: materialId,
            p_quantity: quantity,
            p_order_id: orderId
        });

        if (error) {
            logError(error, { materialId, quantity, orderId, action: 'consumeMaterial' });
            throw new Error(`Failed to consume material: ${error.message}`);
        }
    }

    /**
     * Releases reserved stock back to inventory using the release_material database RPC.
     */
    static async releaseMaterial(materialId: number, quantity: number, orderId: string): Promise<void> {
        if (!isSupabaseConfigured()) {
            return;
        }

        const { error } = await supabase.rpc('release_material', {
            p_material_id: materialId,
            p_quantity: quantity,
            p_order_id: orderId
        });

        if (error) {
            logError(error, { materialId, quantity, orderId, action: 'releaseMaterial' });
            throw new Error(`Failed to release material: ${error.message}`);
        }
    }
}
