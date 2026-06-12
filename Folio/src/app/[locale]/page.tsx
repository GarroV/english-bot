import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Home() {
  const t = useTranslations("HomePage");

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-6 py-32 px-16 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-lg text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>
        <Link
          href="/login"
          className="rounded-md bg-sky-600 px-5 py-2.5 font-medium text-white transition hover:bg-sky-500"
        >
          {t("cta")}
        </Link>
      </main>
    </div>
  );
}
