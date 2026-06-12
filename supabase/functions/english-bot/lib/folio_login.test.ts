import { assertEquals } from "https://deno.land/std/assert/mod.ts";
import { parseLoginPayload } from "./folio_login.ts";

Deno.test("parses folio_login payload", () => {
  assertEquals(parseLoginPayload("/start folio_login_abc123"), "abc123");
});
Deno.test("returns null for plain /start", () => {
  assertEquals(parseLoginPayload("/start"), null);
});
Deno.test("returns null for other payloads", () => {
  assertEquals(parseLoginPayload("/start somethingelse"), null);
});
