import { useTranslations } from "next-intl";
import { LoginPanel } from "./LoginPanel";

export default function LoginPage() {
  const t = useTranslations("Login");
  return (
    <main className="flex flex-1 items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
          <span className="h-4 w-4 rounded-full bg-primary" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6">
          <LoginPanel
            labels={{
              button: t("button"),
              waiting: t("waiting"),
              expired: t("expired"),
              error: t("error"),
            }}
          />
        </div>
      </div>
    </main>
  );
}
