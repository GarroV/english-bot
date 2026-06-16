import type { SupabaseClient } from "@supabase/supabase-js";

// Populate a fresh workspace with a small, coherent demo dataset so a new tutor sees a
// non-empty product (students, schedule, journal, billing, a homework template). The
// tutor can archive/delete it. Best-effort: the caller must not let a failure here abort
// registration. Uses the admin client (service role) with explicit workspace_id.
export async function seedDemoWorkspace(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
): Promise<void> {
  const { data: students } = await admin
    .from("folio_students")
    .insert([
      { workspace_id: workspaceId, name: "Анна Иванова", default_rate: 1500, notes: "Демо-ученик — можно удалить" },
      { workspace_id: workspaceId, name: "Пётр Смирнов", default_rate: 1500 },
      { workspace_id: workspaceId, name: "Мария Котова", default_rate: 2000 },
    ])
    .select("id");
  if (!students || students.length < 3) return;
  const anna = students[0].id as string;
  const maria = students[2].id as string;

  // One past (completed) and one upcoming (scheduled) solo lesson with Анна.
  const past = new Date(Date.now() - 24 * 3600 * 1000); past.setHours(12, 0, 0, 0);
  const future = new Date(Date.now() + 24 * 3600 * 1000); future.setHours(15, 0, 0, 0);
  const { data: lessons } = await admin
    .from("folio_lessons")
    .insert([
      { workspace_id: workspaceId, type: "solo", scheduled_at: past.toISOString(), duration_min: 60, status: "completed", location_type: "online" },
      { workspace_id: workspaceId, type: "solo", scheduled_at: future.toISOString(), duration_min: 60, status: "scheduled", location_type: "offline" },
    ])
    .select("id");
  if (lessons && lessons.length === 2) {
    const pastLesson = lessons[0].id as string;
    const futureLesson = lessons[1].id as string;
    await admin.from("folio_lesson_students").insert([
      { lesson_id: pastLesson, student_id: anna },
      { lesson_id: futureLesson, student_id: anna },
    ]);
    await admin.from("folio_lesson_journal").insert({
      workspace_id: workspaceId, lesson_id: pastLesson, created_by: ownerId,
      topic: "Present Perfect", level: "B1",
      comment: "Разобрали разницу с Past Simple, сделали упражнения.",
      progress: "Уверенно строит утверждения, путается в вопросах.",
    });
    // Keep the M5 invariant (charge ⇔ completed) for the demo completed lesson, plus a payment.
    await admin.from("folio_student_payments").insert([
      { workspace_id: workspaceId, student_id: anna, amount: 1500, type: "charge", lesson_id: pastLesson, created_by: ownerId },
      { workspace_id: workspaceId, student_id: anna, amount: 1500, type: "payment", note: "Оплата за урок", created_by: ownerId },
    ]);
  }

  const { data: tpl } = await admin
    .from("folio_homework_templates")
    .insert({
      workspace_id: workspaceId, module_type: "READING_MODULE", level: "B1", age_group: "adult",
      topic: "Travel", source: "web", created_by: ownerId,
      content: "Демо-шаблон задания. Открой «Домашки» и сгенерируй своё — это просто пример.",
    })
    .select("id")
    .single();
  if (tpl) {
    await admin.from("folio_homework_assignments").insert({
      workspace_id: workspaceId, template_id: tpl.id, student_id: maria, assigned_by: ownerId, status: "assigned",
    });
  }
}
