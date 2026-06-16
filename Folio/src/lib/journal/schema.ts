import { z } from "zod";

// CEFR levels offered in the journal's level select (optional).
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;

// Validated journal-entry input. All fields optional (the form sends blanks as
// undefined); reject a fully-empty entry — there is nothing to save.
export const journalInputSchema = z
  .object({
    topic: z.string().trim().max(200).optional(),
    level: z.enum(CEFR_LEVELS).optional(),
    comment: z.string().trim().max(5000).optional(),
    progress: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Boolean(v.topic || v.level || v.comment || v.progress), {
    message: "Заполните хотя бы одно поле",
  });

export type JournalInput = z.infer<typeof journalInputSchema>;
