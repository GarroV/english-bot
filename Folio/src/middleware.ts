import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

// NOTE: this is the `middleware.ts` (Edge runtime) convention, NOT Next 16's
// `proxy.ts`. Next 16 locks `proxy` to the Node.js runtime, which the Cloudflare
// Workers target (OpenNext) cannot run; `middleware` keeps the Edge runtime that
// Workers supports. Our logic here is Edge-safe (cookie check + redirect + intl).

const intlMiddleware = createMiddleware(routing);

// Locale-aware path is like /ru/dashboard ; strip the locale prefix for matching.
// Public: the locale root (landing), /login, and /invite/* (signup via invite link).
const PUBLIC_FIRST_SEGMENTS = ["login", "invite"];

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
  if (pathname.startsWith("/api")) return NextResponse.next();

  if (!isPublicPath(pathname) && !hasSupabaseSession(request)) {
    const parts = pathname.split("/").filter(Boolean);
    const locale = routing.locales.includes(parts[0] as typeof routing.locales[number])
      ? parts[0]
      : routing.defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  }

  return intlMiddleware(request);
}

export const config = {
  // Skip Next internals and static files; run on everything else.
  matcher: ["/((?!_next|.*\\..*).*)"],
};
