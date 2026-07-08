import { getTranslations } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBalances, listBillingEntries, listMonthLessons } from "@/lib/billing/queries";
import { buildStudentBilling } from "@/lib/billing/fifo";
import { buildRangeSummary, mskMonthKey, monthLabelRu } from "@/lib/billing/summary";
import { resolvePeriod, buildChartBuckets, type PeriodParams } from "@/lib/billing/period";
import { formatRub } from "@/lib/format/money";
import { PeriodSummaryCard } from "./PeriodSummaryCard";
import { EarningsChart } from "./EarningsChart";
import { StudentCards, type StudentCardData } from "./StudentCards";

const DAY_MS = 86_400_000;

export default async function BillingPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect({ href: "/login", locale: "ru" });
    return null;
  }

  const nowISO = new Date().toISOString();
  const period = resolvePeriod(await searchParams, nowISO);

  const [balances, entries, periodLessons] = await Promise.all([
    listBalances(), listBillingEntries(), listMonthLessons(period.fromISO, period.toISO),
  ]);

  const summary = buildRangeSummary(entries, periodLessons, period.fromISO, period.toISO, nowISO);
  const buckets = buildChartBuckets(entries, period.fromISO, period.toISO);

  // Выписка в «Напомнить» всегда месячная: выбранный месяц в режиме месяца, иначе текущий.
  const monthKey = period.kind === "month" ? mskMonthKey(period.fromISO) : mskMonthKey(nowISO);

  // FIFO по каждому ученику — на сервере; клиенту уходят только сериализуемые данные.
  const byStudent = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byStudent.get(e.student_id) ?? [];
    list.push(e);
    byStudent.set(e.student_id, list);
  }
  const now = new Date(nowISO).getTime();
  const cards: StudentCardData[] = balances.map((b) => {
    const st = buildStudentBilling(byStudent.get(b.student_id) ?? []);
    return {
      student_id: b.student_id, name: b.name, balance: b.balance,
      debt: st.debt, advance: st.advance,
      advanceLessons: b.default_rate && b.default_rate > 0 ? Math.floor(st.advance / b.default_rate) : null,
      oldestDebtDays: st.oldestDebtDate ? Math.max(0, Math.floor((now - new Date(st.oldestDebtDate).getTime()) / DAY_MS)) : null,
      paidUpTo: st.paidUpTo, defaultRate: b.default_rate, rows: st.rows,
    };
  });
  // Должники сверху (самый давний долг первым), затем аванс, затем нулевые.
  cards.sort((a, c) => {
    if (a.debt > 0 !== c.debt > 0) return a.debt > 0 ? -1 : 1;
    if (a.debt > 0 && c.debt > 0) return (c.oldestDebtDays ?? 0) - (a.oldestDebtDays ?? 0);
    if (a.advance > 0 !== c.advance > 0) return a.advance > 0 ? -1 : 1;
    return a.name.localeCompare(c.name, "ru");
  });

  const totalDebt = cards.reduce((s, x) => s + x.debt, 0);
  const debtors = cards.filter((x) => x.debt > 0).length;
  const totalAdvance = cards.reduce((s, x) => s + x.advance, 0);
  const prepaid = cards.filter((x) => x.advance > 0).length;

  const t = await getTranslations("Billing");

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 p-4 sm:p-6 xl:flex-row">
      {/* Слева — всё про деньги за выбранный период */}
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <h1 className="text-4xl font-bold">{t("title")}</h1>

        <PeriodSummaryCard
          summary={summary}
          awaiting={totalDebt}
          period={period}
          labels={{
            charged: t("summaryCharged"), received: t("summaryReceived"), awaiting: t("summaryAwaiting"),
            lessons: t("summaryLessons"),
            lessonsLine: t("summaryLessonsLine", { done: summary.lessonsCompleted, cancelled: summary.lessonsCancelled, upcoming: summary.lessonsUpcoming }),
            forecast: t("summaryForecast", { count: summary.forecastCount, amount: formatRub(summary.forecastAmount) }),
            week: t("periodWeek"), month: t("periodMonth"), year: t("periodYear"), custom: t("periodCustom"),
            range: { from: t("customFrom"), to: t("customTo"), show: t("customShow") },
          }}
        />

        <EarningsChart
          buckets={buckets}
          labels={{
            title: t("chartTitle"), charged: t("summaryCharged"),
            received: t("summaryReceived"), empty: t("chartEmpty"),
          }}
        />

        <p className="text-sm text-muted-foreground">
          <span className={totalDebt > 0 ? "font-semibold text-destructive" : ""}>{t("inDebtTotal", { amount: formatRub(totalDebt), count: debtors })}</span>
          {"  ·  "}
          <span className={totalAdvance > 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>{t("prepaidTotal", { amount: formatRub(totalAdvance), count: prepaid })}</span>
        </p>
      </div>

      {/* Справа — ученики */}
      <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[30rem]">
        <h2 className="font-heading text-xl font-bold">{t("studentsTitle")}</h2>
        <StudentCards
          cards={cards}
          monthKey={monthKey}
          monthLabel={monthLabelRu(monthKey)}
          labels={{
            recordPayment: t("recordPayment"), recordCharge: t("recordCharge"), amount: t("amount"),
            note: t("note"), save: t("save"), cancel: t("cancel"), saved: t("saved"), saveError: t("saveError"),
            empty: t("empty"), ledger: t("ledger"), hide: t("hide"), delete: t("delete"),
            payment: t("payment"), noEntries: t("noEntries"),
            debtBadge: t.raw("debtBadge"), paidUpTo: t.raw("paidUpTo"), advanceBadge: t.raw("advanceBadge"),
            advanceLessons: t.raw("advanceLessons"), advanceRenew: t("advanceRenew"),
            lessonFrom: t.raw("lessonFrom"), statusPaid: t("statusPaid"), statusPartial: t.raw("statusPartial"),
            statusDebt: t("statusDebt"), cancelledBadge: t("cancelledBadge"),
            extraCharge: t("extraCharge"), discount: t("discount"),
            chargeKindExtra: t("chargeKindExtra"), chargeKindDiscount: t("chargeKindDiscount"),
            notePlaceholder: t("notePlaceholder"),
            chipPayOffDebt: t.raw("chipPayOffDebt"), chipLessons: t.raw("chipLessons"),
            remind: t("remind"), remindCopied: t("remindCopied"), remindDebt: t("remindDebt"),
            remindStatement: t("remindStatement"),
          }}
        />
      </aside>
    </main>
  );
}
