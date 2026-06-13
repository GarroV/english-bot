import { generateModuleContent } from "../_shared/generate.ts";

const MODULE_TYPES = [
  "READING_MODULE", "VOCABULARY_MODULE", "TRANSLATION_TEXTS", "TRANSLATION_SENTENCES", "VERB_SENTENCES",
];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Shared generation engine over HTTP for the Folio web. Secret-gated; reuses ANTHROPIC_KEY.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (req.headers.get("x-folio-secret") !== Deno.env.get("FOLIO_GENERATE_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const { moduleType, level, ageGroup, topic, verb } = await req.json();
    if (!MODULE_TYPES.includes(moduleType) || typeof topic !== "string" || !topic.trim()) {
      return json({ error: "bad request" }, 400);
    }
    const content = await generateModuleContent(
      moduleType,
      { level, ageGroup, version: "student", targetVerb: verb },
      topic,
    );
    return json({ content });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "generation failed" }, 500);
  }
});
