import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBalances, listLedgerEntries } from "@/lib/billing/queries";
import { BalancesList } from "./BalancesList";

export default async function BillingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const [balances, ledger] = await Promise.all([listBalances(), listLedgerEntries()]);
  const t = await getTranslations("Billing");
  const labels = {
    student: t("student"), charged: t("charged"), paid: t("paid"), balance: t("balance"),
    recordPayment: t("recordPayment"), amount: t("amount"), note: t("note"), save: t("save"),
    cancel: t("cancel"), saved: t("saved"), saveError: t("saveError"), empty: t("empty"),
    ledger: t("ledger"), hide: t("hide"), delete: t("delete"), charge: t("charge"),
    payment: t("payment"), noEntries: t("noEntries"),
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-4xl font-bold">{t("title")}</h1>
      <BalancesList balances={balances} ledger={ledger} labels={labels} />
    </main>
  );
}
