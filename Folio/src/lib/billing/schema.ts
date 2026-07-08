import { z } from "zod";

export const paymentInputSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).optional(),
});

export type PaymentInput = z.infer<typeof paymentInputSchema>;

// Ручное начисление: доплата (учебник, пробное) или разовая скидка. Сумма всегда вводится
// положительной — знак определяет kind (не-технарь не должен вводить минусы), минус ставит сервер.
export const chargeInputSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  kind: z.enum(["extra", "discount"]),
  note: z.string().trim().max(500).optional(),
});

export type ChargeInput = z.infer<typeof chargeInputSchema>;
