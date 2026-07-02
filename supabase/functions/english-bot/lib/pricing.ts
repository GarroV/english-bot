import type { LlmUsage } from "./types.ts";

// Per-1M-token USD rates by model. Cache read ≈ 0.1× input, cache write ≈ 1.25× input (Anthropic).
// Keep in sync with MODEL in _shared/generate.ts when it changes; unknown models fall back to Sonnet.
interface Rate {
  inUsd: number;
  outUsd: number;
  cacheReadUsd: number;
  cacheWriteUsd: number;
}

const PRICING: Record<string, Rate> = {
  "claude-sonnet-4-6": { inUsd: 3, outUsd: 15, cacheReadUsd: 0.3, cacheWriteUsd: 3.75 },
};
const FALLBACK: Rate = PRICING["claude-sonnet-4-6"];

// USD cost of one call's token usage for the given model.
export function usageCostUsd(model: string, u: LlmUsage): number {
  const r = PRICING[model] ?? FALLBACK;
  return (
    u.input_tokens * r.inUsd +
    u.output_tokens * r.outUsd +
    u.cache_read_input_tokens * r.cacheReadUsd +
    u.cache_creation_input_tokens * r.cacheWriteUsd
  ) / 1_000_000;
}
