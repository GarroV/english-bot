import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

// NOTE: this is the `middleware.ts` (Edge runtime) convention, NOT Next 16's
// `proxy.ts`. Next 16 locks `proxy` to the Node.js runtime, which the Cloudflare
// Workers target (OpenNext) cannot run; `middleware` keeps the Edge runtime that
// Workers supports. Our logic here is Edge-safe (cookie check + redirect + intl).

const intlMiddleware = createMiddleware(routing);

// Security headers applied to every response. CSP keeps 'unsafe-inline' for scripts because a
// nonce-based CSP needs proxy.ts (Node runtime), which the Cloudflare Workers target (OpenNext)
// cannot run — so the hard protections here are frame-ancestors (clickjacking), object-src, base-uri
// and connect-src (exfil). Tightening script-src (SRI/nonce) is tracked in BACKLOG and needs a
// preview deploy to verify it doesn't break Next hydration.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("Content-Security-Policy", CSP);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  return res;
}

// Locale-aware path is like /ru/dashboard ; strip the locale prefix for matching.
// Public: the locale root (landing), /login, /invite/* (signup) and /s/* (student cabinet by token).
const PUBLIC_FIRST_SEGMENTS = ["login", "invite", "s"];

function isPublicPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean); // ["ru","invite","tok"]
  const afterLocale = parts.slice(1);                 // ["invite","tok"]
  if (afterLocale.length === 0) return true;          // locale root (landing)
  return PUBLIC_FIRST_SEGMENTS.includes(afterLocale[0]);
}

// Optimistic Supabase session check: presence of an auth cookie. Real check is server-side.
function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes bypass intl + auth gating here (each route guards itself).
  if (pathname.startsWith("/api")) return withSecurityHeaders(NextResponse.next());

  if (!isPublicPath(pathname) && !hasSupabaseSession(request)) {
    const parts = pathname.split("/").filter(Boolean);
    const locale = routing.locales.includes(parts[0] as typeof routing.locales[number])
      ? parts[0]
      : routing.defaultLocale;
    return withSecurityHeaders(NextResponse.redirect(new URL(`/${locale}/login`, request.url)));
  }

  return withSecurityHeaders(intlMiddleware(request));
}

export const config = {
  // Skip Next internals and static files; run on everything else.
  matcher: ["/((?!_next|.*\\..*).*)"],
};
