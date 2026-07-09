"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MessageSquareText } from "lucide-react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { sendFeedback, type FeedbackCategory } from "@/lib/feedback/actions";

const CATEGORIES: FeedbackCategory[] = ["bug", "idea", "other"];

// Кнопка «Оставить отзыв» в шапке (#67): категория + текст → владельцу в Telegram и в folio_feedback.
export function FeedbackDialog() {
  const t = useTranslations("Feedback");
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      const res = await sendFeedback(category, message);
      if (res.ok) {
        toast.success(t("thanks"));
        setOpen(false);
        setMessage("");
      } else {
        toast.error(res.error === "rate_limited" ? t("rateLimited") : t("error"));
      }
    } catch {
      toast.error(t("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button variant="ghost" size="icon" aria-label={t("open")} title={t("open")} />
      }>
        <MessageSquareText />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("title")}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("categoryLabel")}>
            {CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c}
                onClick={() => setCategory(c)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  category === c
                    ? "border-transparent bg-accent font-semibold text-accent-foreground"
                    : "border-border hover:border-primary"
                }`}>
                {t(`cat_${c}`)}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            rows={5}
            placeholder={t("placeholder")}
            className="w-full resize-y rounded-xl border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={pending || !message.trim()}>{t("send")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
