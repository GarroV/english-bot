"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeedbackDialog } from "@/components/FeedbackDialog";
import { HeaderActions, type HeaderActionsLabels } from "./dashboard/HeaderActions";
import type { QuickPaymentLabels } from "./billing/QuickPaymentDialog";
import type { QuickLessonLabels } from "./schedule/QuickLessonDialog";

const NAV = [
  { href: "/dashboard", key: "dashboard" },
  { href: "/schedule", key: "schedule" },
  { href: "/homework", key: "homework" },
  { href: "/billing", key: "billing" },
] as const;

// Top navigation bar (replaces the left rail) — full-width bento needs the horizontal space.
// Hosts nav + global quick-create actions (lesson/payment) + theme, so pages don't need a second
// header row. "Админка" shows only for super_admin (resolved server-side in the layout).
export function TopNav({
  isSuperAdmin, students, headerLabels, paymentLabels, lessonLabels,
}: {
  isSuperAdmin?: boolean;
  students: { id: string; name: string }[];
  headerLabels: HeaderActionsLabels;
  paymentLabels: QuickPaymentLabels;
  lessonLabels: QuickLessonLabels;
}) {
  const pathname = usePathname();
  const t = useTranslations("Nav");
  const td = useTranslations("Dashboard");
  const nav = isSuperAdmin ? [...NAV, { href: "/admin", key: "admin" } as const] : NAV;

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-sidebar-border bg-sidebar/90 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-sidebar/75">
      {/* Логотип отделён от пунктов меню воздухом и разделителем — чтобы не читался как ещё одна кнопка. */}
      <Link href="/dashboard" className="flex flex-none items-center gap-2 pr-2">
        <span className="inline-block h-3.5 w-3.5 rounded-full bg-primary" aria-hidden />
        <span className="font-heading text-xl font-extrabold tracking-tight">Folio</span>
      </Link>
      <span aria-hidden className="h-5 w-px flex-none bg-border" />
      <nav className="ml-1 flex flex-1 items-center gap-1 overflow-x-auto">
        {nav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={[
                "whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
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
      <HeaderActions students={students} labels={headerLabels} paymentLabels={paymentLabels} lessonLabels={lessonLabels} />
      <FeedbackDialog />
      <ThemeToggle labels={{ system: td("themeSystem"), light: td("themeLight"), dark: td("themeDark") }} />
    </header>
  );
}
