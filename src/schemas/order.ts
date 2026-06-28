import { z } from 'zod';

export const createOrderCustomerSchema = z.object({
  name: z.string().min(1).max(256),
  email: z.string().email().max(256),
  phone: z.string().min(8).max(32).optional(),
});

export const createOrderRequestSchema = z.object({
  external_order_id: z.string().min(1).max(128),
  merchant_profile_id: z.string().min(1).max(64).optional(),
  product_key: z.string().min(1).max(128),
  description: z.string().min(1).max(512),
  amount: z.number().int().positive(),
  currency: z.literal('IDR').default('IDR'),
  customer: createOrderCustomerSchema,
  return_url: z.string().url(),
  fulfillment_data: z.record(z.unknown()).default({}),
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const orderStatusResponseSchema = z.object({
  order_id: z.string(),
  external_order_id: z.string().optional(),
  payment_status: z.string(),
  fulfillment_status: z.string(),
  provider: z.string(),
  amount: z.number(),
  currency: z.string(),
  checkout_url: z.string().url().nullable().optional(),
  expires_at: z.string().nullable().optional(),
  paid_at: z.string().nullable().optional(),
});

export type OrderStatusResponse = z.infer<typeof orderStatusResponseSchema>;