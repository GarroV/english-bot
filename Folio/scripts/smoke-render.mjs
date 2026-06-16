// Headless smoke: mint a real session for the seeded super_admin and render an
// authenticated page, then report whether the Next.js error overlay is present.
// Usage: node scripts/smoke-render.mjs /ru/homework
import { readFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const path = process.argv[2] ?? "/ru/homework";
const EMAIL = "v.garro@dodobrands.io";

// Load .env.local
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// 1) admin: generate a magiclink to get a verifiable OTP token_hash
const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
if (linkErr) { console.error("generateLink failed:", linkErr.message); process.exit(1); }
const tokenHash = link.properties.hashed_token;

// 2) verifyOtp via a cookie-capturing SSR client to get the app's exact cookie format
const jar = new Map();
const supa = createServerClient(url, publishable, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error: otpErr } = await supa.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
if (otpErr) { console.error("verifyOtp failed:", otpErr.message); process.exit(1); }

const cookieHeader = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
if (!cookieHeader) { console.error("no auth cookie minted"); process.exit(1); }

// 3) render the page with the session cookie
const res = await fetch(`http://localhost:3000${path}`, { headers: { cookie: cookieHeader }, redirect: "manual" });
const body = await res.text();
const location = res.headers.get("location");
const isRedirect = res.status >= 300 && res.status < 400;
const badStatus = res.status >= 500 || res.status === 404;
// HTTP status is the authoritative signal — Next embeds error-boundary fallback
// strings (e.g. "This page could not be found", __next_error__) into HEALTHY page
// bodies, so generic body-text grep gives false positives. The only body string we
// trust is the specific server-component serialization error, which a dev 200 can
// still surface via the overlay payload.
const errorText = body.includes("Functions cannot be passed directly to Client Components")
  ? "Functions cannot be passed to Client Components"
  : null;
console.log(`status=${res.status} bytes=${body.length} path=${path}`);
if (location) console.log("location=", location);
const h1 = body.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1];
if (!isRedirect) console.log("h1=", h1 ?? "(none)");
const failed = badStatus || (!isRedirect && !!errorText);
console.log(failed ? `FAIL: ${errorText ?? `status ${res.status}`}` : (isRedirect ? "OK (redirect)" : "OK (rendered)"));
process.exit(failed ? 1 : 0);
