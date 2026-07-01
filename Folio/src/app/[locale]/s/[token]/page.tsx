import { getTranslations } from "next-intl/server";
import { getCabinet } from "@/lib/cabinet/queries";
import { StudentCabinet } from "./StudentCabinet";

// Public student cabinet: access by personal token (no login). The token is the capability;
// getCabinet scopes everything by it. Inherits the [locale] layout (i18n/theme), not the tutor shell.
export default async function CabinetPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const nowISO = new Date().toISOString();
  const data = await getCabinet(token, nowISO);
  const t = await getTranslations("Cabinet");

  if (!data) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">{t("invalidTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("invalidBody")}</p>
        </div>
      </main>
    );
  }

  const pdfBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/folio-homework-pdf`;
  return <StudentCabinet data={data} token={token} pdfBase={pdfBase} />;
}
