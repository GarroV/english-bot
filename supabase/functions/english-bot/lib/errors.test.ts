import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { formatAdminAlert } from "./errors.ts";

Deno.test("formatAdminAlert: собирает user/chat/ввод и текст ошибки", () => {
  const alert = formatAdminAlert(new Error("boom"), { userId: 42, chatId: 99, hint: "/new" });
  assertEquals(alert.split("\n"), ["⚠️ Ошибка в боте", "user: 42", "chat: 99", "ввод: /new", "Error: boom"]);
});

Deno.test("formatAdminAlert: chat не дублируется, если равен user (личка)", () => {
  const alert = formatAdminAlert("oops", { userId: 42, chatId: 42, hint: null });
  assertEquals(alert.split("\n"), ["⚠️ Ошибка в боте", "user: 42", "oops"]);
});

Deno.test("formatAdminAlert: длинный ввод и ошибка усечены", () => {
  const alert = formatAdminAlert(new Error("x".repeat(600)), { hint: "y".repeat(200) });
  const lines = alert.split("\n");
  assertEquals(lines[1].length, "ввод: ".length + 121); // 120 + «…»
  assertStringIncludes(lines[2], "…");
  assertEquals(lines[2].length, 501);
});

Deno.test("formatAdminAlert: без контекста — только заголовок и ошибка", () => {
  assertEquals(formatAdminAlert("err", {}), "⚠️ Ошибка в боте\nerr");
});
