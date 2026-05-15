import type { ModuleType, ClarifyingParams } from "./types.ts";

// Detect which module type best fits the user's free-form request
export function detectModule(input: string): ModuleType {
  const s = input.toLowerCase();
  // Translation texts: "переводные тексты", "перевод текстов", "с русского", "по жанру"
  if (/переводн.*текст|перевод.*текст|с русского|по жанр/.test(s)) {
    return "TRANSLATION_TEXTS";
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

// Extract level and age group if they appear explicitly in the request
export function extractParams(input: string): ClarifyingParams {
  const s = input.toLowerCase();
  const levelMatch = s.match(/\b(a1|a2|b1|b2|c1|c2)\b/i);
  const level = levelMatch ? levelMatch[1].toUpperCase() : undefined;

  let ageGroup: string | undefined;
  // Check "молодой взрослый" or "молодые взрослые" first before just "взрослый"
  if (/молод[а-я\w]*\s+взрослы|молод[а-я\w]*\s+взрослый/.test(s)) {
    ageGroup = "young_adult";
  } else if (/подросток|подростк/.test(s)) {
    ageGroup = "teen";
  } else if (/взрослый|взрослых|взрослым/.test(s)) {
    ageGroup = "adult";
  }

  return { level, ageGroup };
}
