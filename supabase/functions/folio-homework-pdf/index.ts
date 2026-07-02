import { createClient } from "npm:@supabase/supabase-js@2";
import { generatePdf } from "../english-bot/lib/pdf.ts";
import { makeFilename } from "../english-bot/lib/utils.ts";

// Student-cabinet PDF: GET ?token=<cabinet_token>&a=<assignmentId>.
// Public (no session) — the token is the capability, exactly like the cabinet page. Everything is
// scoped by token→student; the assignment must belong to that student. Reuses the bot's pdf.ts.
Deno.serve(async (req) => {
  // POST: secret-authed content→PDF for the tutor (Folio server proxies the draft here). No token.
  if (req.method === "POST") {
    if (req.headers.get("x-folio-secret") !== Deno.env.get("FOLIO_GENERATE_SECRET")) {
      return new Response("unauthorized", { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as { content?: unknown } | null;
    const content = typeof body?.content === "string" ? body.content : "";
    if (!content.trim() || content.length > 20000) return new Response("bad request", { status: 400 });
    try {
      const bytes = await generatePdf(content);
      return new Response(bytes.slice(), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${makeFilename(content)}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      return new Response(`pdf failed: ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
    }
  }

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
