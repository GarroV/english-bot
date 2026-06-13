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
