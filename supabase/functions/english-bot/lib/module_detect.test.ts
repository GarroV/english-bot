import { assertEquals } from "jsr:@std/assert";
import { detectModule, extractParams } from "./module_detect.ts";

Deno.test("detectModule: translation texts keywords", () => {
  assertEquals(detectModule("нужны переводные тексты B2"), "TRANSLATION_TEXTS");
  assertEquals(detectModule("перевод текстов с русского"), "TRANSLATION_TEXTS");
  assertEquals(detectModule("переводные тексты по публицистике"), "TRANSLATION_TEXTS");
});

Deno.test("detectModule: translation sentences keywords", () => {
  assertEquals(detectModule("переводные предложения по модальным глаголам"), "TRANSLATION_SENTENCES");
  assertEquals(detectModule("перевод предложений, грамматика сослагательного"), "TRANSLATION_SENTENCES");
  assertEquals(detectModule("изолированные предложения на Past Perfect"), "TRANSLATION_SENTENCES");
});

Deno.test("detectModule: vocabulary keywords", () => {
  assertEquals(detectModule("погонять лексику по теме еда"), "VOCABULARY_MODULE");
  assertEquals(detectModule("словарные упражнения без текста"), "VOCABULARY_MODULE");
  assertEquals(detectModule("лексика по теме путешествия"), "VOCABULARY_MODULE");
});

Deno.test("detectModule: reading is default", () => {
  assertEquals(detectModule("B2, бизнес, взрослый"), "READING_MODULE");
  assertEquals(detectModule("прочитали книгу Animal Farm"), "READING_MODULE");
  assertEquals(detectModule("посмотрели фильм Parasite"), "READING_MODULE");
  assertEquals(detectModule("текст по теме климат"), "READING_MODULE");
});

Deno.test("extractParams: detects level", () => {
  assertEquals(extractParams("C1 модальные глаголы").level, "C1");
  assertEquals(extractParams("B2, бизнес").level, "B2");
  assertEquals(extractParams("a2 еда").level, "A2");
});

Deno.test("extractParams: detects age group", () => {
  assertEquals(extractParams("B1 подросток").ageGroup, "teen");
  assertEquals(extractParams("B1 взрослый").ageGroup, "adult");
  assertEquals(extractParams("B1 молодой взрослый").ageGroup, "young_adult");
  assertEquals(extractParams("B1 молодые взрослые").ageGroup, "young_adult");
});

Deno.test("extractParams: returns undefined for unknown fields", () => {
  const p = extractParams("перевод предложений");
  assertEquals(p.level, undefined);
  assertEquals(p.ageGroup, undefined);
});
