import { z } from "zod";

export const MODULE_TYPES = [
  "READING_MODULE", "VOCABULARY_MODULE", "TRANSLATION_TEXTS", "TRANSLATION_SENTENCES", "VERB_SENTENCES",
] as const;
export const LEVELS = ["A2", "B1", "B2", "C1", "C2"] as const;
export const AGE_GROUPS = ["teen", "young_adult", "adult"] as const;

// Closed enums + bounded topic/verb so a caller can't inflate the prompt sent to Claude.
export const homeworkInputSchema = z
  .object({
    moduleType: z.enum(MODULE_TYPES),
    topic: z.string().trim().min(1).max(500),
    level: z.enum(LEVELS),
    ageGroup: z.enum(AGE_GROUPS),
    verb: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.moduleType !== "VERB_SENTENCES" || !!v.verb, {
    message: "verb required for VERB_SENTENCES",
    path: ["verb"],
  });

export type HomeworkInput = z.infer<typeof homeworkInputSchema>;
