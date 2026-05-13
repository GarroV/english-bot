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

Deno.test("splitIfLong: returns null second part when short", () => {
  const [first, second] = splitIfLong("Short text");
  assertEquals(first, "Short text");
  assertEquals(second, null);
});

Deno.test("splitIfLong: splits at newline when over limit", () => {
  const part1 = "a".repeat(3000);
  const part2 = "b".repeat(2000);
  const [first, second] = splitIfLong(part1 + "\n" + part2);
  assertEquals(second !== null, true);
  assertEquals(first + second, part1 + "\n" + part2);
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
