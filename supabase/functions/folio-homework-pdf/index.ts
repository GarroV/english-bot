import { createClient } from "npm:@supabase/supabase-js@2";
import { generatePdf } from "../english-bot/lib/pdf.ts";
import { makeFilename } from "../english-bot/lib/utils.ts";

// Student-cabinet PDF: GET ?token=<cabinet_token>&a=<assignmentId>.
// Public (no session) — the token is the capability, exactly like the cabinet page. Everything is
// scoped by token→student; the assignment must belong to that student. Reuses the bot's pdf.ts.
Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const assignmentId = url.searchParams.get("a") ?? "";
  if (!token || !assignmentId) return new Response("bad request", { status: 400 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Resolve the token → student; then require the assignment to belong to that student.
  const { data: student } = await supabase
    .from("folio_students").select("id").eq("cabinet_token", token).maybeSingle();
  if (!student) return new Response("not found", { status: 404 });

  const { data: asg } = await supabase
    .from("folio_homework_assignments")
    .select("id, folio_homework_templates(topic, content)")
    .eq("id", assignmentId)
    .eq("student_id", student.id)
    .maybeSingle();
  const tplRaw = asg?.folio_homework_templates as { topic: string; content: string } | { topic: string; content: string }[] | null | undefined;
  const tpl = Array.isArray(tplRaw) ? tplRaw[0] : tplRaw;
  if (!tpl?.content) return new Response("not found", { status: 404 });

  try {
    const bytes = await generatePdf(tpl.content);
    // .slice() → fresh ArrayBuffer-backed copy (not SharedArrayBuffer), satisfies BodyInit.
    return new Response(bytes.slice(), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${makeFilename(tpl.content)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return new Response(`pdf failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
});
