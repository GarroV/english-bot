import { z } from "zod";

export const MODULE_TYPES = [
  "READING_MODULE", "VOCABULARY_MODULE", "TRANSLATION_TEXTS", "TRANSLATION_SENTENCES", "VERB_SENTENCES",
] as const;

export const homeworkInputSchema = z
  .object({
    moduleType: z.enum(MODULE_TYPES),
    topic: z.string().trim().min(1),
    level: z.string().trim().min(1),
    ageGroup: z.string().trim().min(1),
    verb: z.string().trim().optional(),
  })
  .refine((v) => v.moduleType !== "VERB_SENTENCES" || !!v.verb, {
    message: "verb required for VERB_SENTENCES",
    path: ["verb"],
  });

export type HomeworkInput = z.infer<typeof homeworkInputSchema>;
