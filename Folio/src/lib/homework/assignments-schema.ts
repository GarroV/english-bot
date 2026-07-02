import { z } from "zod";

// Live-doc Ф2 review cycle: assigned → submitted ⇄ returned → accepted.
// 'reviewed' is the legacy terminal state, kept for backward-compatible validation of pre-migration rows.
export const ASSIGNMENT_STATUSES = ["assigned", "submitted", "returned", "accepted", "reviewed"] as const;

export const assignInputSchema = z.object({
  templateId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AssignInput = z.infer<typeof assignInputSchema>;

export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
