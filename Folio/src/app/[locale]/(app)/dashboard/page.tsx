import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect({ href: "/login", locale: "ru" });

  const { data: profile } = await supabase
    .from("folio_users")
    .select("role, name")
    .eq("id", user!.id)
    .maybeSingle();

  const t = await getTranslations("Dashboard");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        {t("role")}: {profile?.role ?? "—"} ({profile?.name ?? "—"})
      </p>
    </main>
  );
}
