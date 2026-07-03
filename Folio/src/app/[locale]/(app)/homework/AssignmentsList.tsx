"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  loadReview, commentOnItem, returnAssignment, acceptAssignment, postTutorMessage,
} from "@/lib/homework/assignments";
import { getMessages } from "@/lib/homework/queries";
import type { AssignmentRow, AssignmentReview, ReviewItem, ChatMessage } from "@/lib/homework/queries";
import { ChatThread, type ChatLabels } from "@/components/homework/ChatThread";
import { formatDate } from "@/lib/format/date";

interface Labels {
  assignmentsTitle: string; noAssignments: string; noDue: string; saveError: string;
  reviewOpen: string; reviewTitle: string; loading: string;
  studentAnswer: string; noAnswer: string; commentPlaceholder: string;
  saveComment: string; commentSaved: string;
  returnBtn: string; returned: string; acceptBtn: string; accepted: string;
  acceptedReadonly: string;
  chat: ChatLabels;
  typeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
}

export function AssignmentsList({ assignments, labels }: {
  assignments: AssignmentRow[];
  labels: Labels;
}) {
  const [reviewId, setReviewId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{labels.assignmentsTitle}</h2>
      {assignments.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.noAssignments}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{a.student_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">
                  {a.template_topic ?? "—"}{a.template_type ? ` · ${labels.typeLabels[a.template_type] ?? a.template_type}` : ""} · {a.due_date ? formatDate(a.due_date) : labels.noDue}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={a.status} label={labels.statusLabels[a.status] ?? a.status} />
                <Button variant="outline" size="sm" onClick={() => setReviewId(a.id)}>{labels.reviewOpen}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReviewDialog reviewId={reviewId} onClose={() => setReviewId(null)} labels={labels} />
    </div>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls: Record<string, string> = {
    assigned: "bg-primary/12 text-primary",
    submitted: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    returned: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    accepted: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    reviewed: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  };
  return <span className={`flex-none rounded-full px-2.5 py-0.5 text-xs font-bold ${cls[status] ?? cls.assigned}`}>{label}</span>;
}

// Loads the itemized review on open, lets the tutor comment per item and return/accept the assignment.
function ReviewDialog({ reviewId, onClose, labels }: {
  reviewId: string | null;
  onClose: () => void;
  labels: Labels;
}) {
  const router = useRouter();
  const [review, setReview] = useState<AssignmentReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  function onOpenChange(open: boolean) {
    if (!open) { onClose(); setReview(null); setMessages([]); }
  }

  // Load the itemized payload + chat thread whenever a new assignment is opened for review; ignore a
  // stale response if the dialog was closed / switched before it resolved.
  useEffect(() => {
    if (!reviewId) return;
    let active = true;
    setLoading(true);
    setReview(null);
    setMessages([]);
    loadReview(reviewId)
      .then((res) => {
        if (!active) return;
        if (res.ok) setReview(res.review);
        else toast.error(`${labels.saveError}: ${res.error}`);
      })
      .catch(() => { if (active) toast.error(labels.saveError); })
      .finally(() => { if (active) setLoading(false); });
    getMessages(reviewId)
      .then((msgs) => { if (active) setMessages(msgs); })
      .catch(() => { /* thread loads best-effort; polling retries */ });
    return () => { active = false; };
  }, [reviewId, labels.saveError]);

  async function doReturn() {
    if (!review) return;
    setBusy(true);
    try {
      const res = await returnAssignment(review.id);
      if (res.ok) { toast.success(labels.returned); router.refresh(); onClose(); setReview(null); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch { toast.error(labels.saveError); } finally { setBusy(false); }
  }

  async function doAccept() {
    if (!review) return;
    setBusy(true);
    try {
      const res = await acceptAssignment(review.id);
      if (res.ok) { toast.success(labels.accepted); router.refresh(); onClose(); setReview(null); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch { toast.error(labels.saveError); } finally { setBusy(false); }
  }

  const isAccepted = review?.status === "accepted" || review?.status === "reviewed";
  // Return only makes sense once the student has submitted; accept from submitted or returned.
  const canReturn = review?.status === "submitted";
  const canAccept = review?.status === "submitted" || review?.status === "returned";

  return (
    <Dialog open={reviewId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {labels.reviewTitle}
            {review && (
              <span className="ml-2 font-normal text-muted-foreground">
                {review.studentName ?? "—"}{review.templateTopic ? ` · ${review.templateTopic}` : ""}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !review ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{labels.loading}</p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            {isAccepted && (
              <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                {labels.acceptedReadonly}
              </p>
            )}
            {review.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : (
              review.items.map((item) => (
                <ReviewItemRow key={item.id} item={item} readOnly={isAccepted} labels={labels} />
              ))
            )}

            {!isAccepted && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                <Button variant="outline" onClick={doReturn} disabled={busy || !canReturn}>
                  {labels.returnBtn}
                </Button>
                <Button onClick={doAccept} disabled={busy || !canAccept}>
                  {labels.acceptBtn}
                </Button>
              </div>
            )}

            {/* Chat stays open in every status, including after accept (discussion continues). */}
            <ChatThread
              messages={messages}
              mine="tutor"
              onSend={(body) => postTutorMessage(review.id, body)}
              onRefresh={() => getMessages(review.id)}
              labels={labels.chat}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// One question: label + text + the student's answer + an editable per-item tutor comment.
function ReviewItemRow({ item, readOnly, labels }: {
  item: ReviewItem;
  readOnly: boolean;
  labels: Labels;
}) {
  const [comment, setComment] = useState(item.tutorComment ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const dirty = comment !== (item.tutorComment ?? "");

  async function save() {
    setSaveState("saving");
    try {
      const res = await commentOnItem(item.id, comment);
      setSaveState(res.ok ? "saved" : "error");
      if (!res.ok) toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      setSaveState("error");
      toast.error(labels.saveError);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      {item.taskLabel && (
        <p className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{item.taskLabel}</p>
      )}
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{item.questionText}</p>

      <div className="mt-2 rounded-lg border border-border bg-card px-3 py-2">
        <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{labels.studentAnswer}</p>
        {item.studentAnswer ? (
          <p className="whitespace-pre-wrap text-sm">{item.studentAnswer}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">{labels.noAnswer}</p>
        )}
      </div>

      {readOnly ? (
        item.tutorComment && (
          <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 p-2.5">
            <p className="whitespace-pre-wrap text-sm">{item.tutorComment}</p>
          </div>
        )
      ) : (
        <div className="mt-2">
          <textarea
            value={comment}
            onChange={(e) => { setComment(e.target.value); setSaveState("idle"); }}
            rows={2}
            maxLength={5000}
            placeholder={labels.commentPlaceholder}
            className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
          />
          <div className="mt-1 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={save} disabled={saveState === "saving" || !dirty}>
              {labels.saveComment}
            </Button>
            {saveState === "saved" && <span className="text-xs text-muted-foreground">{labels.commentSaved}</span>}
            {saveState === "error" && <span className="text-xs text-destructive">{labels.saveError}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
