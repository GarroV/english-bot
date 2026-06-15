import { z } from "zod";

export const paymentInputSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).optional(),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;
