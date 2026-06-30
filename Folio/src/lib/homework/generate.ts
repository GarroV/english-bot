import type { HomeworkInput } from "./schema";

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
