import { z } from "zod";

export const lessonInputSchema = z.object({
  scheduledAt: z.string().datetime(),
  durationMin: z.number().int().min(1).max(600),
  locationType: z.enum(["online", "offline"]),
  studentIds: z.array(z.string().min(1)).min(1),
  notes: z.string().trim().optional(),
});

export type LessonInput = z.infer<typeof lessonInputSchema>;

// Lesson type is derived from roster size: one student = solo, several = group.
export function lessonTypeFor(studentIds: readonly string[]): "solo" | "group" {
  return studentIds.length > 1 ? "group" : "solo";
}
