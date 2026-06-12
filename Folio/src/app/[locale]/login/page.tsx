import { useTranslations } from "next-intl";
import { LoginPanel } from "./LoginPanel";

export default function LoginPage() {
  const t = useTranslations("Login");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
      <LoginPanel
        labels={{
          button: t("button"),
          waiting: t("waiting"),
          expired: t("expired"),
          error: t("error"),
        }}
      />
    </main>
  );
}
