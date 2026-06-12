"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/students", key: "students" },
] as const;

// Soft sidebar (left rail on desktop, top bar on mobile) with an active-state pill.
export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("Nav");

  return (
    <aside className="flex w-full shrink-0 flex-row items-center gap-2 border-b border-sidebar-border bg-sidebar p-3 md:w-60 md:flex-col md:items-stretch md:gap-1 md:border-b-0 md:border-r md:p-5">
      <div className="flex items-center gap-2 px-2 md:mb-5 md:py-1">
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-primary" aria-hidden />
        <span className="font-heading text-xl font-extrabold tracking-tight">Folio</span>
      </div>
      <nav className="flex flex-1 flex-row gap-1 md:flex-none md:flex-col">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              ].join(" ")}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
