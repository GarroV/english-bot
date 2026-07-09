"use client";

import { Fragment } from "react";
import { splitBlanks } from "@/lib/cabinet/inline";

export interface InlineDocLabels {
  freeLabel: string;
  freePlaceholder: string;
}

// Текст задания с ответами прямо в пропусках (#56): каждый `___` становится полем ввода
// (editable) или подсвеченным ответом (readonly — у репетитора и после сдачи). Если пропусков
// нет — текст + одно свободное поле ответа (ключ "free"). Общий для кабинета и ревью.
export function InlineAnswersDoc({ content, answers, editable, onChange, labels }: {
  content: string;
  answers: Record<string, string>;
  editable: boolean;
  onChange?: (next: Record<string, string>) => void;
  labels: InlineDocLabels;
}) {
  const parts = splitBlanks(content);
  const hasBlanks = parts.some((p) => p.type === "blank");

  const set = (key: string, value: string) => onChange?.({ ...answers, [key]: value });

  if (!hasBlanks) {
    const free = answers["free"] ?? "";
    return (
      <div className="flex flex-col gap-3">
        <div className="whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 font-sans text-sm leading-relaxed">
          {content}
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{labels.freeLabel}</span>
          {editable ? (
            <textarea
              value={free}
              onChange={(e) => set("free", e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder={labels.freePlaceholder}
              className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none transition-colors focus:border-primary"
            />
          ) : (
            <p className={`whitespace-pre-wrap rounded-lg border border-border bg-card px-3 py-2 text-sm ${free ? "" : "italic text-muted-foreground"}`}>
              {free || "—"}
            </p>
          )}
        </label>
      </div>
    );
  }

  return (
    <div className="whitespace-pre-wrap rounded-xl border border-border bg-background/50 p-3 font-sans text-sm leading-relaxed">
      {parts.map((p, i) => {
        if (p.type === "text") return <Fragment key={i}>{p.value}</Fragment>;
        const key = String(p.idx);
        const value = answers[key] ?? "";
        if (!editable) {
          return (
            <span key={i}
              className={`mx-0.5 inline-block min-w-12 rounded-md px-1.5 py-0.5 align-baseline ${
                value ? "bg-accent font-medium text-accent-foreground" : "border-b border-dashed border-muted-foreground/50 text-muted-foreground"
              }`}>
              {value || " "}
            </span>
          );
        }
        return (
          <input key={i}
            value={value}
            onChange={(e) => set(key, e.target.value)}
            maxLength={1000}
            size={Math.min(48, Math.max(8, value.length + 2))}
            aria-label={`${labels.freeLabel} ${p.idx + 1}`}
            className="mx-0.5 inline-block w-auto rounded-md border border-input bg-card px-2 py-0.5 align-baseline text-sm outline-none transition-colors focus:border-primary"
          />
        );
      })}
    </div>
  );
}
