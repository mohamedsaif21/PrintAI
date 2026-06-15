import { z } from "zod";

/**
 * Validation schemas for PrintAI API endpoints
 */

// Common schema for machine status
const MachineStatus = z.enum(["available", "busy", "backup", "breakdown"]);

// Common schema for order priority
const Priority = z.enum(["High", "Medium", "Low"]);

// Common schema for order status
const OrderStatus = z.enum(["Pending", "Scheduled", "In Progress", "Completed", "At Risk"]);

/**
 * Schema for creating a new order via POST /api/schedule
 */
export const CreateOrderSchema = z.object({
  customer: z.string().min(1, "Customer name is required").max(100),
  product: z.string().min(1, "Product name is required").max(100),
  quantity: z.union([z.number().positive(), z.string().transform(Number)]).refine((n) => n > 0, "Quantity must be positive"),
  paperType: z.string().min(1, "Paper type is required").max(50),
  priority: Priority,
  deadlineHour: z.union([z.number().int().min(0).max(23), z.string().transform(Number)]),
});

export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

/**
 * Schema for updating an order via PATCH /api/orders
 */
export const UpdateOrderSchema = z.object({
  id: z.string().min(1, "Order ID is required"),
  status: OrderStatus.optional(),
});

export type UpdateOrderInput = z.infer<typeof UpdateOrderSchema>;

/**
 * Schema for updating a machine via PATCH /api/machines
 */
export const UpdateMachineSchema = z.object({
  id: z.string().min(1, "Machine ID is required"),
  status: MachineStatus.optional(),
  utilisation: z.number().int().min(0).max(100).optional(),
});

export type UpdateMachineInput = z.infer<typeof UpdateMachineSchema>;

/**
 * Utility function to validate and parse data
 */
export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
      return { success: false, error: messages };
    }
    return { success: false, error: "Validation failed" };
  }
}
