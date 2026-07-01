import { assertEquals } from "jsr:@std/assert";

// telegram.ts throws at import time unless TELEGRAM_BOT_TOKEN is set — set it before importing.
Deno.env.set("TELEGRAM_BOT_TOKEN", "test-token");
const { sendMessage } = await import("./telegram.ts");

type Captured = { url: string; body: Record<string, unknown> };

// Stub global fetch to record calls and return a scripted sequence of responses.
function stubFetch(responses: Response[]): { calls: Captured[]; restore: () => void } {
  const calls: Captured[] = [];
  const original = globalThis.fetch;
  let i = 0;
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return Promise.resolve(responses[Math.min(i++, responses.length - 1)].clone());
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const okResponse = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
const parseError = () =>
  new Response(
    JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: can't parse entities in message text" }),
    { status: 400 },
  );

Deno.test("sendMessage: retries as plain text when Markdown fails to parse", async () => {
  const { calls, restore } = stubFetch([parseError(), okResponse()]);
  try {
    await sendMessage(123, "*unbalanced markdown");
  } finally {
    restore();
  }
  assertEquals(calls.length, 2);
  assertEquals(calls[0].body.parse_mode, "Markdown"); // first attempt uses Markdown
  assertEquals(calls[1].body.parse_mode, undefined); // retry drops parse_mode
  assertEquals(calls[1].body.text, "*unbalanced markdown"); // same content, so nothing is lost
});

Deno.test("sendMessage: retry preserves the reply keyboard", async () => {
  const { calls, restore } = stubFetch([parseError(), okResponse()]);
  const kb = { inline_keyboard: [[{ text: "x", callback_data: "x" }]] };
  try {
    await sendMessage(123, "*broken", kb);
  } finally {
    restore();
  }
  assertEquals(calls.length, 2);
  assertEquals(calls[1].body.reply_markup, kb); // keyboard survives the plain-text retry
});

Deno.test("sendMessage: no retry on success", async () => {
  const { calls, restore } = stubFetch([okResponse()]);
  try {
    await sendMessage(123, "hello");
  } finally {
    restore();
  }
  assertEquals(calls.length, 1);
});

Deno.test("sendMessage: no retry on a non-parse error", async () => {
  const chatNotFound = new Response(
    JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: chat not found" }),
    { status: 400 },
  );
  const { calls, restore } = stubFetch([chatNotFound]);
  try {
    await sendMessage(123, "hi");
  } finally {
    restore();
  }
  assertEquals(calls.length, 1); // only a parse error triggers the plain-text retry
});
