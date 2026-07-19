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

// English-language demo dataset — same shape as seedDemoWorkspace, but the visible strings are in
// English. Used ONLY by the portfolio demo workspace (which is shown at /en). Kept separate so the
// real Russian onboarding seed for new tutors stays untouched.
export async function seedDemoWorkspaceEn(
  admin: SupabaseClient,
  workspaceId: string,
  ownerId: string,
): Promise<void> {
  const { data: students } = await admin
    .from("folio_students")
    .insert([
      { workspace_id: workspaceId, name: "Emma Carter", default_rate: 30, notes: "Demo student — feel free to delete" },
      { workspace_id: workspaceId, name: "Liam Bennett", default_rate: 30 },
      { workspace_id: workspaceId, name: "Sophia Nguyen", default_rate: 40 },
    ])
    .select("id");
  if (!students || students.length < 3) return;
  const emma = students[0].id as string;
  const sophia = students[2].id as string;

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
      { lesson_id: pastLesson, student_id: emma },
      { lesson_id: futureLesson, student_id: emma },
    ]);
    await admin.from("folio_lesson_journal").insert({
      workspace_id: workspaceId, lesson_id: pastLesson, created_by: ownerId,
      topic: "Present Perfect", level: "B1",
      comment: "Covered the difference with Past Simple, did practice exercises.",
      progress: "Confident with statements, still mixes up questions.",
    });
    await admin.from("folio_student_payments").insert([
      { workspace_id: workspaceId, student_id: emma, amount: 30, type: "charge", lesson_id: pastLesson, created_by: ownerId },
      { workspace_id: workspaceId, student_id: emma, amount: 30, type: "payment", note: "Lesson payment", created_by: ownerId },
    ]);
  }

  const { data: tpl } = await admin
    .from("folio_homework_templates")
    .insert({
      workspace_id: workspaceId, module_type: "READING_MODULE", level: "B1", age_group: "adult",
      topic: "Travel", source: "web", created_by: ownerId,
      content: "Demo homework template. Open “Homework” and generate your own — this is just a sample.",
    })
    .select("id")
    .single();
  if (tpl) {
    await admin.from("folio_homework_assignments").insert({
      workspace_id: workspaceId, template_id: tpl.id, student_id: sophia, assigned_by: ownerId, status: "assigned",
    });
  }
}
