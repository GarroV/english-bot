"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RangeFormLabels {
  from: string;
  to: string;
  show: string;
}

// Форма произвольного диапазона: две даты (включительно) → /billing?p=custom&from=…&to=….
export function CustomRangeForm({ initialFrom, initialTo, labels }: {
  initialFrom: string;
  initialTo: string;
  labels: RangeFormLabels;
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const valid = from !== "" && to !== "" && from <= to;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    router.push(`/billing?p=custom&from=${from}&to=${to}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {labels.from}
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-auto" required />
      </label>
      <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {labels.to}
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-auto" required />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={!valid}>{labels.show}</Button>
    </form>
  );
}
