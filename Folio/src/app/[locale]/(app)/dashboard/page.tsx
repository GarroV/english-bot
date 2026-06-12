import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const { data: profile } = await supabase
    .from("folio_users")
    .select("role, name")
    .eq("id", user.id)
    .maybeSingle();

  const t = await getTranslations("Dashboard");
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">{t("role")}</p>
        <p className="mt-1 text-lg font-bold">
          {profile?.role ?? "—"} · {profile?.name ?? "—"}
        </p>
      </div>
    </main>
  );
}
