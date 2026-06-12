import { z } from "zod";

// Validated student input. Optional fields are omitted (undefined), not empty strings —
// the form converts blanks to undefined before calling the server actions.
export const studentInputSchema = z.object({
  name: z.string().trim().min(1, "Имя обязательно"),
  email: z.string().trim().email("Некорректный email").optional(),
  telegramId: z.number().int().positive().optional(),
  defaultRate: z.number().nonnegative().optional(),
  notes: z.string().trim().optional(),
});

export type StudentInput = z.infer<typeof studentInputSchema>;
