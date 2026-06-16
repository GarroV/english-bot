import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// OpenNext Cloudflare adapter config. Default config (in-memory/no incremental cache)
// is fine for Folio — pages are per-request dynamic (auth-gated), so there is little
// to cache. Add R2/KV incremental cache here later if static caching is needed.
export default defineCloudflareConfig();
