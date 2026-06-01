import type { ModuleType, ClarifyingParams } from "./types.ts";

// Detect which module type best fits the user's free-form request
export function detectModule(input: string): ModuleType {
  const s = input.toLowerCase();
  // Translation texts: "переводные тексты", "перевод текстов", "с русского", "по жанру"
  if (/переводн.*текст|перевод.*текст|с русского|по жанр/.test(s)) {
    return "TRANSLATION_TEXTS";
  }
  // Verb sentences: "задание на глаголы X" or "упражнение на глагол X"
  if (/задание на глагол|упражнение на глагол/.test(s)) {
    return "VERB_SENTENCES";
  }
  // Translation sentences: "переводные предложения", "грамматика", "модальные глаголы", "изолированные предложения"
  if (/переводн.*предложен|перевод.*предложен|грамматик|модальн.*глаго|изолирован.*предложен/.test(s)) {
    return "TRANSLATION_SENTENCES";
  }
  // Vocabulary: "лексика", "словарные", "погонять", "без текста"
  if (/лексик|словарн|погонять|без текста/.test(s)) {
    return "VOCABULARY_MODULE";
  }
  return "READING_MODULE";
}

// Extract the target verb(s) from a VERB_SENTENCES request.
// Matches text after "глагол" until the first comma or end of string.
// Returns empty string when no verb is found.
export function extractVerb(input: string): string {
  const match = input.match(/глаголы?\s+([^,\n]+)/i);
  if (!match) return "";
  const verb = match[1].trim();
  // If the extracted part looks like a level (A2/B1/etc.) or age, it's not a verb
  if (/^(a1|a2|b1|b2|c1|c2|взросл|подрост|молод)/i.test(verb)) return "";
  return verb;
}

// Extract level and age group if they appear explicitly in the request
export function extractParams(input: string): ClarifyingParams {
  const s = input.toLowerCase();
  const levelMatch = s.match(/\b(a1|a2|b1|b2|c1|c2)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : undefined;

  let ageGroup: string | undefined;
  if (/молод[а-я\w]*\s+взрослы|молод[а-я\w]*\s+взрослый/.test(s)) {
    ageGroup = "young_adult";
  } else if (/подросток|подростк/.test(s)) {
    ageGroup = "teen";
  } else if (/взрослый|взрослых|взрослым/.test(s)) {
    ageGroup = "adult";
  }

  return { level, ageGroup };
}
