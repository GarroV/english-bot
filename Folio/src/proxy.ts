import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

// Locale-aware path is like /ru/dashboard ; strip the locale prefix for matching.
const PUBLIC_SEGMENTS = ["", "login"]; // "" = locale root (landing)

function isPublicPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean); // ["ru","dashboard"]
  const afterLocale = parts.slice(1).join("/");       // "dashboard"
  return PUBLIC_SEGMENTS.includes(afterLocale);
}

// Optimistic Supabase session check: presence of an auth cookie. Real check is server-side.
function hasSupabaseSession(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => /^sb-.*-auth-token/.test(c.name));
}

export function proxy(request: NextRequest) {
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
