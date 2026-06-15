import { z } from "zod";

export const ASSIGNMENT_STATUSES = ["assigned", "submitted", "reviewed"] as const;

export const assignInputSchema = z.object({
  templateId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()).min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AssignInput = z.infer<typeof assignInputSchema>;

export const assignmentStatusSchema = z.enum(ASSIGNMENT_STATUSES);
