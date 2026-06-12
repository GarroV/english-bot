import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Home() {
  const t = useTranslations("HomePage");

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-background">
      {/* soft teal glow for atmosphere */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <main className="relative flex w-full max-w-2xl flex-col items-center justify-center gap-6 px-8 py-32 text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-sm font-semibold text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />
          Folio
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="max-w-md text-lg text-muted-foreground">{t("subtitle")}</p>
        <Link
          href="/login"
          className="rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90"
        >
          {t("cta")}
        </Link>
      </main>
    </div>
  );
}
