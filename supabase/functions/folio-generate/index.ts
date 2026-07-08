import { createClient } from "npm:@supabase/supabase-js@2";
import { generateModuleContent, applyEdit, itemizeHomework, MODEL } from "../_shared/generate.ts";
import { getWorkspaceGenerationBudget } from "../_shared/quota.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MODULE_TYPES = [
  "READING_MODULE", "VOCABULARY_MODULE", "TRANSLATION_TEXTS", "TRANSLATION_SENTENCES", "VERB_SENTENCES",
];
const LEVELS = ["A2", "B1", "B2", "C1", "C2"];
const AGE_GROUPS = ["teen", "young_adult", "adult"];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Shared generation engine over HTTP for the Folio web. Secret-gated; reuses ANTHROPIC_KEY.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (req.headers.get("x-folio-secret") !== Deno.env.get("FOLIO_GENERATE_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }
  try {
    const body = await req.json();

    // Edit action — вычитка/правка существующего задания (движок умеет applyEdit).
    if (body.action === "edit") {
      const { content, edit } = body;
      if (
        typeof content !== "string" || !content.trim() || content.length > 20000 ||
        typeof edit !== "string" || !edit.trim() || edit.length > 1000
      ) {
        return json({ error: "bad request" }, 400);
      }
      const edited = await applyEdit(content, edit);
      return json({ content: edited });
    }

    // Itemize action — разбор текста задания на структурированные вопросы (live-doc Ф1a).
    if (body.action === "itemize") {
      const { content } = body;
      if (typeof content !== "string" || !content.trim() || content.length > 20000) {
        return json({ error: "bad request" }, 400);
      }
      const items = await itemizeHomework(content);
      return json({ items });
    }

    // Generate action (default).
    const { moduleType, level, ageGroup, topic, verb, workspaceId } = body;
    // Allowlist everything that flows into the prompt — the function is callable directly.
    if (
      !MODULE_TYPES.includes(moduleType) ||
      typeof topic !== "string" || !topic.trim() || topic.length > 500 ||
      !LEVELS.includes(level) || !AGE_GROUPS.includes(ageGroup) ||
      (verb != null && (typeof verb !== "string" || verb.length > 100)) ||
      (workspaceId != null && (typeof workspaceId !== "string" || !UUID_RE.test(workspaceId)))
    ) {
      return json({ error: "bad request" }, 400);
    }

    // Квота генераций (#75): проверка ДО платного вызова. Сбой проверки — fail-open
    // (мягкий биллинг-контроль, как учёт usage); исчерпанный лимит — жёсткий 402.
    if (workspaceId) {
      const budget = await getWorkspaceGenerationBudget(supabase, workspaceId).catch((e) => {
        console.error("quota check failed:", e);
        return null;
      });
      if (budget && budget.used >= budget.granted) {
        return json({ error: "quota_exceeded", used: budget.used, granted: budget.granted }, 402);
      }
    }

    const content = await generateModuleContent(
      moduleType,
      { level, ageGroup, version: "student", targetVerb: verb },
      topic,
      // Учёт расхода (#23): пишем module-вызов на воркспейс — им же считается квота.
      workspaceId
        ? async (u) => {
          const { error } = await supabase.from("eb_llm_usage").insert({
            source: "folio",
            ref_id: workspaceId,
            action: "module",
            model: MODEL,
            input_tokens: u.input_tokens ?? 0,
            output_tokens: u.output_tokens ?? 0,
            cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          });
          if (error) console.error("usage log failed:", error.message);
        }
        : undefined,
    );
    return json({ content });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "generation failed" }, 500);
  }
});
