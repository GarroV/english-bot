import { assertEquals } from "jsr:@std/assert";
import { makeFilename, splitIfLong, normalizeRequest, generateInviteCode } from "./utils.ts";

Deno.test("makeFilename: extracts level and topic", () => {
  const text = "Level: A2 · Topic: Food and Restaurants · Age group: Teenager\n\nSome text";
  assertEquals(makeFilename(text), "A2_Food_and_Restaurants.pdf");
});

Deno.test("makeFilename: level only when no topic match", () => {
  const text = "Level: B1\nSome text";
  assertEquals(makeFilename(text), "B1.pdf");
});

Deno.test("makeFilename: falls back to homework", () => {
  assertEquals(makeFilename("plain text"), "homework.pdf");
});

Deno.test("splitIfLong: returns single-element array when short", () => {
  const result = splitIfLong("Short text");
  assertEquals(result, ["Short text"]);
});

Deno.test("splitIfLong: splits into multiple chunks when over limit", () => {
  const part1 = "a".repeat(3000);
  const part2 = "b".repeat(3000);
  const part3 = "c".repeat(2000);
  const text = part1 + "\n" + part2 + "\n" + part3;
  const parts = splitIfLong(text);
  assertEquals(parts.length > 1, true);
  assertEquals(parts.join(""), text);
  assertEquals(parts.every((p) => p.length <= 4096), true);
});

Deno.test("normalizeRequest: lowercases and removes punctuation", () => {
  assertEquals(
    normalizeRequest("A2, Еда и Рестораны, Подросток!"),
    "a2 еда и рестораны подросток"
  );
});

Deno.test("generateInviteCode: returns 6-char uppercase alphanumeric", () => {
  const code = generateInviteCode();
  assertEquals(code.length, 6);
  assertEquals(code, code.toUpperCase());
  assertEquals(/^[A-Z0-9]{6}$/.test(code), true);
});
