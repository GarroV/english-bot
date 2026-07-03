"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { markSubmitted, saveAnswer, postStudentMessage, listStudentMessages } from "@/lib/cabinet/actions";
import type { CabinetData } from "@/lib/cabinet/queries";
import type { CabAssignment, CabItem, CabLesson } from "@/lib/cabinet/derive";
import type { ChatMessage } from "@/lib/homework/queries";
import { ChatThread } from "@/components/homework/ChatThread";

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
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Load the chat thread once on mount; ChatThread then polls via listStudentMessages. Best-effort —
  // a failed initial load leaves an empty thread that polling will fill.
  useEffect(() => {
    let active = true;
    listStudentMessages(token, a.id)
      .then((res) => { if (active && res.ok) setChatMessages(res.messages); })
      .catch(() => { /* transient — polling retries */ });
    return () => { active = false; };
  }, [token, a.id]);

  // Throw on failure so ChatThread's polling .catch() keeps the current thread on a transient blip
  // (returning [] would blank the thread every failed poll). Matches the tutor side's getMessages.
  async function refreshChat(): Promise<ChatMessage[]> {
    const res = await listStudentMessages(token, a.id);
    if (!res.ok) throw new Error(res.error);
    return res.messages;
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
  const hasItems = a.items.length > 0;
  // Editable while assigned (first pass) or returned (tutor sent it back); frozen once submitted/accepted.
  const editable = a.status === "assigned" || a.status === "returned";

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

      {/* Live-doc Ф1b: structured questions with per-item answer fields (autosave). Falls back to the
          plain-text "show homework" toggle for assignments generated before itemization. */}
      {hasItems && (
        <ItemsEditor items={a.items} token={token} editable={editable} status={a.status} />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!hasItems && (
          <button type="button" onClick={() => setOpen((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold transition-colors hover:border-primary">
            {open ? t("hideContent") : t("showContent")}
          </button>
        )}
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

      {!hasItems && open && (
        <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 font-sans text-sm leading-relaxed">
          {a.content}
        </div>
      )}

      <ChatThread
        messages={chatMessages}
        mine="student"
        onSend={(body) => postStudentMessage(token, a.id, body)}
        onRefresh={refreshChat}
        labels={{
          title: t("chatTitle"), placeholder: t("chatPlaceholder"), send: t("chatSend"),
          sending: t("chatSending"), empty: t("chatEmpty"), sendError: t("chatSendError"),
          tutorLabel: t("chatTutor"), studentLabel: t("chatStudent"),
        }}
      />
    </article>
  );
}

// Renders itemized questions grouped by task_label. Each question has an answer textarea that
// autosaves (debounced) via saveAnswer. When not editable (submitted/accepted) fields are read-only;
// the lock notice explains why — waiting for review vs finally accepted.
function ItemsEditor({ items, token, editable, status }: {
  items: CabItem[]; token: string; editable: boolean; status: string;
}) {
  const t = useTranslations("Cabinet");
  const groups = groupByLabel(items);
  const isAccepted = status === "accepted" || status === "reviewed";
  const lockNotice = isAccepted ? t("answersAccepted") : t("answersLocked");

  return (
    <div className="mt-3 flex flex-col gap-4">
      {!editable && (
        <p className={`rounded-lg px-3 py-2 text-xs font-medium ${
          isAccepted
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        }`}>
          {lockNotice}
        </p>
      )}
      {groups.map((g) => (
        <div key={g.label ?? "__none"} className="flex flex-col gap-3">
          {g.label && (
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.label}</p>
          )}
          {g.items.map((item) => (
            <ItemRow key={item.id} item={item} token={token} editable={editable} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ItemRow({ item, token, editable }: { item: CabItem; token: string; editable: boolean }) {
  const t = useTranslations("Cabinet");
  const [value, setValue] = useState(item.studentAnswer ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending debounce on unmount so a late save doesn't fire against a gone component.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  function onChange(next: string) {
    setValue(next);
    if (!editable) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSaveState("saving");
    timerRef.current = setTimeout(async () => {
      try {
        const res = await saveAnswer(token, item.id, next);
        setSaveState(res.ok ? "saved" : "error");
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.questionText}</p>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("yourAnswer")}</span>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={!editable}
          rows={2}
          maxLength={5000}
          placeholder={t("answerPlaceholder")}
          className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      {editable && saveState !== "idle" && (
        <p className={`mt-1 text-xs ${saveState === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {saveState === "saving" ? t("saving") : saveState === "saved" ? t("answerSaved") : t("answerSaveError")}
        </p>
      )}
      {item.tutorComment && (
        <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-2.5">
          <p className="mb-0.5 text-xs font-bold uppercase tracking-wider text-emerald-500">{t("tutorComment")}</p>
          <p className="whitespace-pre-wrap text-sm">{item.tutorComment}</p>
        </div>
      )}
    </div>
  );
}

// Group consecutive items sharing a task_label into labeled blocks, preserving idx order.
function groupByLabel(items: CabItem[]): { label: string | null; items: CabItem[] }[] {
  const groups: { label: string | null; items: CabItem[] }[] = [];
  for (const item of items) {
    const label = item.taskLabel;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

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
