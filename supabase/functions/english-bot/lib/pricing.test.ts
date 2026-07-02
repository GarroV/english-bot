import { assertEquals } from "jsr:@std/assert";
import { usageCostUsd } from "./pricing.ts";

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

Deno.test("usageCostUsd: sonnet-4-6 input+output", () => {
  const cost = usageCostUsd("claude-sonnet-4-6", {
    input_tokens: 2000,
    output_tokens: 2000,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  });
  // 2000*3/1e6 + 2000*15/1e6 = 0.006 + 0.030
  assertEquals(round6(cost), 0.036);
});

Deno.test("usageCostUsd: unknown model falls back to sonnet rates", () => {
  const cost = usageCostUsd("mystery-model", {
    input_tokens: 1000,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  });
  assertEquals(round6(cost), 0.003);
});

Deno.test("usageCostUsd: cache read/write priced separately", () => {
  const cost = usageCostUsd("claude-sonnet-4-6", {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
  });
  // 1M*3.75/1e6 + 1M*0.30/1e6 = 3.75 + 0.30
  assertEquals(round6(cost), 4.05);
});

Deno.test("usageCostUsd: zero usage is zero", () => {
  assertEquals(
    usageCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    }),
    0,
  );
});
