import { z } from "zod";
import { ORDER_TYPES, PAYMENT_METHODS, ROLES, UNITS } from "./constants";

export const menuItemSchema = z.object({
  name: z.string().min(1).max(80),
  category_id: z.string().uuid().nullable().optional(),
  price: z.coerce.number().min(0),
  is_veg: z.coerce.boolean().default(true),
  is_available: z.coerce.boolean().default(true),
  prep_minutes: z.coerce.number().int().min(0).max(240).default(15),
  description: z.string().max(300).optional().nullable(),
});

export const ingredientSchema = z.object({
  name: z.string().min(1).max(80),
  unit: z.enum(UNITS),
  reorder_level: z.coerce.number().min(0).default(0),
  cost_per_unit: z.coerce.number().min(0).default(0),
  barcode: z.string().max(64).optional().nullable(),
  category: z.string().max(30).optional().nullable(),
  brand: z.string().max(60).optional().nullable(),
  pack_qty: z.coerce.number().min(0).optional().nullable(),
});
export const labourerSchema = z.object({
  full_name: z.string().min(1).max(80), phone: z.string().max(20).optional().nullable(), skill: z.string().max(40).optional().nullable(),
  daily_wage: z.coerce.number().min(0).default(0), id_type: z.string().max(30).optional().nullable(), id_last4: z.string().max(4).optional().nullable(),
  address: z.string().max(200).optional().nullable(), emergency_contact: z.string().max(60).optional().nullable(), notes: z.string().max(300).optional().nullable(),
  joined_on: z.string().optional(),
});
/** What the vision model must return for a photo scan. */
export const scanResultSchema = z.object({
  kind: z.enum(["ingredient", "dish", "room", "labour", "product", "unknown"]),
  name: z.string().max(80),
  confidence: z.number().min(0).max(1).default(0.5),
  unit: z.enum(UNITS).optional(),
  estimated_qty: z.number().min(0).optional(),
  category: z.string().max(30).optional(),
  brand: z.string().max(60).optional(),
  barcode: z.string().max(64).optional(),
  price_estimate_inr: z.number().min(0).optional(),
  is_veg: z.boolean().optional(),
  description: z.string().max(200).optional(),
  room_number: z.string().max(10).optional(),
  labour: z.object({ full_name: z.string().optional(), phone: z.string().optional(), id_type: z.string().optional(), id_last4: z.string().optional(), skill: z.string().optional(), address: z.string().optional() }).optional(),
  notes: z.string().max(200).optional(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

export const stockMoveSchema = z.object({
  ingredient_id: z.string().uuid(),
  qty: z.coerce.number().positive(),
  reason: z.enum(["purchase", "wastage", "adjustment", "opening"]),
  note: z.string().max(200).optional(),
});

export const newOrderSchema = z.object({
  type: z.enum(ORDER_TYPES),
  table_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().max(80).optional().nullable(),
  customer_phone: z.string().max(20).optional().nullable(),
  items: z.array(z.object({ menu_item_id: z.string().uuid(), qty: z.number().int().positive(), notes: z.string().max(120).optional() })).min(1),
});

export const paymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.coerce.number().positive(),
  ref: z.string().max(80).optional(),
});

export const inviteSchema = z.object({ role: z.enum(ROLES).exclude(["owner"]) });

export const bookingSchema = z.object({
  guest: z.object({ id: z.string().uuid().optional().or(z.literal("")), full_name: z.string().min(1).max(80), phone: z.string().max(20).optional(), email: z.string().max(120).optional(), id_type: z.string().max(30).optional(), id_last4: z.string().max(4).optional(), address: z.string().max(200).optional() }),
  room_id: z.string().uuid(),
  check_in: z.string(), check_out: z.string(),
  adults: z.coerce.number().int().min(1).max(10).default(2),
  children: z.coerce.number().int().min(0).max(10).default(0),
  rate: z.coerce.number().min(0),
  advance: z.coerce.number().min(0).default(0),
  source: z.string().max(30).default("walk_in"),
  notes: z.string().max(300).optional(),
});
