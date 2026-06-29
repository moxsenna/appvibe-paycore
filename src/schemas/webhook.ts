import { z } from 'zod';

/** Duitku server callback (form or JSON fields). */
export const duitkuCallbackPayloadSchema = z.object({
  merchantCode: z.string().min(1),
  amount: z.union([z.string(), z.number()]),
  merchantOrderId: z.string().min(1),
  productDetail: z.string().optional(),
  additionalParam: z.string().optional(),
  paymentCode: z.string().optional(),
  resultCode: z.string().min(1),
  merchantUserId: z.string().optional(),
  reference: z.string().optional(),
  signature: z.string().min(1),
});

export type DuitkuCallbackPayload = z.infer<typeof duitkuCallbackPayloadSchema>;

const mayarTimestampSchema = z.union([z.number(), z.string()]);

export const mayarWebhookPayloadSchema = z.object({
  event: z.string(),
  data: z.object({
    id: z.string(),
    transactionId: z.string().optional(),
    status: z.union([z.boolean(), z.string()]),
    amount: z.number(),
    createdAt: mayarTimestampSchema.optional(),
    updatedAt: mayarTimestampSchema.optional(),
  }).passthrough(),
}).passthrough();

export type MayarWebhookPayload = z.infer<typeof mayarWebhookPayloadSchema>;

export const paymentSucceededEventSchema = z.object({
  event_id: z.string(),
  event_type: z.literal('payment.succeeded'),
  occurred_at: z.string(),
  data: z.object({
    order_id: z.string(),
    external_order_id: z.string(),
    app_id: z.string(),
    provider: z.string(),
    provider_reference: z.string().nullable(),
    amount: z.number().int(),
    currency: z.string(),
    paid_at: z.string(),
    fulfillment_data: z.record(z.unknown()),
  }),
});

export type PaymentSucceededEvent = z.infer<typeof paymentSucceededEventSchema>;