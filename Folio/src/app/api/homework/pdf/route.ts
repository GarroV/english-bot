import { createClient } from "@/lib/supabase/server";

// Tutor-only: turn the current draft/template content into a downloadable PDF. Session-gated, then
// proxies to the folio-homework-pdf Edge Function (secret-authed) which runs the shared pdf.ts.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });

  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  const content = typeof body?.content === "string" ? body.content : "";
  if (!content.trim()) return new Response("bad request", { status: 400 });

  const pdfUrl = process.env.FOLIO_GENERATE_URL!.replace(/\/folio-generate\/?$/, "/folio-homework-pdf");
  const res = await fetch(pdfUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) return new Response("pdf failed", { status: 502 });

  return new Response(await res.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="homework.pdf"',
      "Cache-Control": "no-store",
    },
  });
}
