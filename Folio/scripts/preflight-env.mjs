// Deploy preflight: refuse to build/deploy Folio without the public env vars present.
//
// Why this exists: NEXT_PUBLIC_* are inlined into the bundle at BUILD time from .env.local. A build
// run in a fresh git worktree (where .env.local — gitignored — was never copied) inlines them EMPTY,
// which ships a bundle where the Supabase client is created with an empty URL → the whole app 500s
// (login, student cabinet, dashboard). The build/deploy stay GREEN, so nothing catches it. This
// script makes that failure loud and early instead of silent and in production.
// Incident: 2026-07-08. See docs + memory "folio-deploy-build-gate".

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME",
];

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));

function fail(msg) {
  console.error(`\n\x1b[31m✗ DEPLOY PREFLIGHT FAILED\x1b[0m\n  ${msg}\n`);
  console.error("  Folio deploys must run from a checkout that has Folio/.env.local.");
  console.error("  If you are in a git worktree, copy it first:");
  console.error("    cp <main-checkout>/Folio/.env.local ./Folio/.env.local\n");
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(envPath, "utf8");
} catch {
  fail(".env.local not found next to package.json — NEXT_PUBLIC_* would inline empty and 500 the app.");
}

// A var passes only if it has a non-empty value on its line (KEY=<something>).
const missing = REQUIRED.filter((key) => !new RegExp(`^\\s*${key}=\\S`, "m").test(raw));
if (missing.length > 0) {
  fail(`empty or missing in .env.local: ${missing.join(", ")}`);
}

console.log("\x1b[32m✓ preflight env ok\x1b[0m — NEXT_PUBLIC_* present");
