import { assertEquals } from "jsr:@std/assert";
import { isHeaderLine } from "./pdf.ts";

Deno.test("isHeaderLine: строки-заголовки задания и гайда", () => {
  assertEquals(isHeaderLine("Module: Reading · Level: B1 · Topic: Space · Age: teens"), true);
  assertEquals(isHeaderLine("Task 1 · True/False/NS"), true);
  assertEquals(isHeaderLine("Task 12 · Matching"), true);
  assertEquals(isHeaderLine("Teacher's Guide · Module: Reading · Level: B1"), true);
});

Deno.test("isHeaderLine: обычный текст — не заголовок", () => {
  assertEquals(isHeaderLine("The space station orbits Earth every 90 minutes."), false);
  assertEquals(isHeaderLine("1. Task description continues here"), false);
  assertEquals(isHeaderLine("Taskforce is one word"), false);
  assertEquals(isHeaderLine(""), false);
});
