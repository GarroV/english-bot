import type { HomeworkInput } from "./schema";

// Structured homework question from itemization (live-doc Ф1a). Mirrors HomeworkItem in the shared
// engine; Folio cannot import from supabase/functions/_shared, so the type is defined locally.
export type HomeworkItemType = "tf" | "mcq" | "open" | "gap" | "other";
export interface HomeworkItem {
  task_label: string;
  question_text: string;
  item_type: HomeworkItemType;
}

// Server-only: calls the shared generation Edge Function (secret in a header).
export async function callGenerate(input: HomeworkInput): Promise<string> {
  const res = await fetch(process.env.FOLIO_GENERATE_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
    body: JSON.stringify({
      moduleType: input.moduleType,
      level: input.level,
      ageGroup: input.ageGroup,
      topic: input.topic,
      verb: input.verb,
    }),
  });
  if (!res.ok) throw new Error(`folio-generate ${res.status}`);
  const data = (await res.json()) as { content?: string };
  if (!data.content) throw new Error("empty generation");
  return data.content;
}

// Server-only: proofread/revise existing content via the shared engine's applyEdit.
export async function callEdit(content: string, edit: string): Promise<string> {
  const res = await fetch(process.env.FOLIO_GENERATE_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
    body: JSON.stringify({ action: "edit", content, edit }),
  });
  if (!res.ok) throw new Error(`folio-generate edit ${res.status}`);
  const data = (await res.json()) as { content?: string };
  if (!data.content) throw new Error("empty edit result");
  return data.content;
}

// Server-only: itemize free-text homework content into structured questions via the shared engine.
// Best-effort — returns [] on any transport/parse failure so assignment never fails on itemization.
export async function callItemize(content: string): Promise<HomeworkItem[]> {
  try {
    const res = await fetch(process.env.FOLIO_GENERATE_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-folio-secret": process.env.FOLIO_GENERATE_SECRET! },
      body: JSON.stringify({ action: "itemize", content }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: HomeworkItem[] };
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}
