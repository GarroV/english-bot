"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { markSubmitted, saveInlineAnswers } from "@/lib/cabinet/actions";
import type { CabinetData } from "@/lib/cabinet/queries";
import type { CabAssignment, CabLesson } from "@/lib/cabinet/derive";
import { InlineAnswersDoc } from "@/components/homework/InlineAnswersDoc";

// Онлайн-ответы восстановлены 2026-07-09 по запросу владельца (скрывались в #53).
// ВРЕМЕННО (2026-07-08, #64): чат по заданию скрыт. ChatThread.tsx, server actions и таблица
// сообщений целы; восстановить — вернуть из git рендер ChatThread + загрузку треда в AssignmentCard.

const AUTOSAVE_DEBOUNCE_MS = 800;

const mskDateTime = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

export function StudentCabinet({ data, token, pdfBase }: { data: CabinetData; token: string; pdfBase: string }) {
  const t = useTranslations("Cabinet");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <header className="mb-5">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t("greeting", { name: data.student.name })}</h1>
        {data.tutorName && (
          <p className="mt-1 text-sm text-muted-foreground">{t("tutorLabel")}: {data.tutorName}</p>
        )}
      </header>

      {/* Current assignments */}
      <Section title={t("current")}>
        {data.current.length === 0 ? (
          <Empty text={t("noCurrent")} />
        ) : (
          <div className="flex flex-col gap-3">
            {data.current.map((a) => (
              <AssignmentCard key={a.id} a={a} token={token} pdfBase={pdfBase} />
            ))}
          </div>
        )}
      </Section>

      {/* Upcoming lessons */}
      <Section title={t("lessons")}>
        {data.upcoming.length === 0 ? (
          <Empty text={t("noLessons")} />
        ) : (
          <div className="flex flex-col gap-2">
            {data.upcoming.map((l) => <LessonRow key={l.id} l={l} />)}
          </div>
        )}
        {data.recentPast.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("recentLessons")}</p>
            <div className="flex flex-col gap-2 opacity-70">
              {data.recentPast.map((l) => <LessonRow key={l.id} l={l} />)}
            </div>
          </div>
        )}
      </Section>

      {/* Completed assignments (collapsed) */}
      {data.completed.length > 0 && (
        <Section title={t("completed")}>
          <div className="flex flex-col gap-3">
            {data.completed.map((a) => (
              <AssignmentCard key={a.id} a={a} token={token} pdfBase={pdfBase} />
            ))}
          </div>
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2.5 font-heading text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">{text}</p>;
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("Cabinet");
  const map: Record<string, { label: string; cls: string }> = {
    assigned: { label: t("statusAssigned"), cls: "bg-primary/12 text-primary" },
    submitted: { label: t("statusSubmitted"), cls: "bg-amber-500/15 text-amber-500" },
    returned: { label: t("statusReturned"), cls: "bg-orange-500/15 text-orange-500" },
    accepted: { label: t("statusAccepted"), cls: "bg-emerald-500/15 text-emerald-500" },
    reviewed: { label: t("statusAccepted"), cls: "bg-emerald-500/15 text-emerald-500" }, // legacy
  };
  const s = map[status] ?? map.assigned;
  return <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

function AssignmentCard({ a, token, pdfBase }: { a: CabAssignment; token: string; pdfBase: string }) {
  const t = useTranslations("Cabinet");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // Editable while assigned (first pass) or returned (tutor sent it back); frozen once submitted/accepted.
  const editable = a.status === "assigned" || a.status === "returned";
  // Текст раскрыт по умолчанию, пока ученик отвечает; завершённые — свёрнуты.
  const [open, setOpen] = useState(editable);

  // Инлайн-ответы (#56): правки в пропусках автосохраняются целой картой с дебаунсом.
  const [answers, setAnswers] = useState<Record<string, string>>(a.inlineAnswers ?? {});
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function onAnswersChange(next: Record<string, string>) {
    setAnswers(next);
    if (!editable) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = setTimeout(async () => {
      try {
        const res = await saveInlineAnswers(token, a.id, next);
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function onDone() {
    setPending(true);
    try {
      const res = await markSubmitted(token, a.id);
      if (res.ok) { toast.success(t("markedDone")); router.refresh(); }
      else toast.error(t("markError"));
    } catch { toast.error(t("markError")); } finally { setPending(false); }
  }

  const pdfUrl = `${pdfBase}?token=${encodeURIComponent(token)}&a=${encodeURIComponent(a.id)}`;
  const isAccepted = a.status === "accepted" || a.status === "reviewed";

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold">{a.topic}</h3>
        {a.level && <span className="flex-none rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">{a.level}</span>}
        <StatusBadge status={a.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {a.dueDate ? `${t("due")}: ${a.dueDate}` : t("noDue")}
      </p>

      {a.tutorComment && (
        <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3">
          <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-emerald-500">{t("tutorComment")}</p>
          <p className="whitespace-pre-wrap text-sm">{a.tutorComment}</p>
        </div>
      )}

      {!editable && open && (
        <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-medium ${
          isAccepted
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        }`}>
          {isAccepted ? t("answersAccepted") : t("answersLocked")}
        </p>
      )}

      {/* Инлайн-редактор (#56): ответы пишутся прямо в пропусках текста задания. */}
      {open && (
        <div className="mt-3">
          <InlineAnswersDoc
            content={a.content}
            answers={answers}
            editable={editable}
            onChange={onAnswersChange}
            labels={{ freeLabel: t("yourAnswer"), freePlaceholder: t("answerPlaceholder") }}
          />
          {editable && saveState !== "idle" && (
            <p className={`mt-1 text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
              {saveState === "saving" ? t("saving") : saveState === "saved" ? t("answerSaved") : t("answerSaveError")}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary">
          {open ? t("hideContent") : t("showContent")}
        </button>
        <a href={pdfUrl} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary">
          📄 {t("downloadPdf")}
        </a>
        {editable && (
          <button type="button" onClick={onDone} disabled={pending}
            className="ml-auto rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-opacity disabled:opacity-50">
            {pending ? t("marking") : `✓ ${a.status === "returned" ? t("resubmit") : t("markDone")}`}
          </button>
        )}
      </div>

      {/* ВРЕМЕННО (2026-07-08, #64): <ChatThread> — чат по заданию — скрыт. */}
    </article>
  );
}

// Инлайн-ответы (#56) заменили ItemsEditor/ItemRow — поля живут прямо в пропусках текста
// (компонент InlineAnswersDoc, общий с ревью репетитора). Старый код — в git-истории.

function LessonRow({ l }: { l: CabLesson }) {
  const t = useTranslations("Cabinet");
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm">
      <span className="font-medium tabular-nums">{mskDateTime(l.scheduledAt)}</span>
      <span className="text-muted-foreground">· {l.locationType === "online" ? t("online") : t("offline")}</span>
      <span className="ml-auto flex-none rounded-full border border-border px-2 py-0.5 text-xs font-semibold text-muted-foreground">
        {l.type === "group" ? t("group") : t("solo")}
      </span>
    </div>
  );
}
