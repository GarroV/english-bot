"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createLesson } from "@/lib/lessons/actions";
import { fromDatetimeLocal, toDatetimeLocal } from "@/lib/lessons/week";

export interface QuickLessonLabels {
  title: string;
  students: string;
  datetime: string;
  duration: string;
  location: string;
  online: string;
  offline: string;
  save: string;
  cancel: string;
  saved: string;
  error: string;
  pickStudents: string;
  noStudents: string;
}

// Default the datetime to the next full hour (local wall-clock), so a quick-add lands on a tidy slot.
function nextHourLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toDatetimeLocal(d);
}

// Reusable "add a lesson" dialog: pick student(s), time, duration, format — creates via createLesson.
// Hosted by the dashboard header quick action so a lesson can be booked without leaving the current page.
export function QuickLessonDialog({
  open, onOpenChange, students, labels,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: { id: string; name: string }[];
  labels: QuickLessonLabels;
}) {
  const router = useRouter();
  const [datetime, setDatetime] = useState("");
  const [duration, setDuration] = useState("60");
  const [location, setLocation] = useState<"online" | "offline">("online");
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Seed a fresh default time on open; reset on close so reopening starts clean (derived-state pattern).
  if (open && !seeded) {
    setSeeded(true);
    setDatetime(nextHourLocal());
  } else if (!open && seeded) {
    setSeeded(false);
    setPicked([]);
    setDuration("60");
    setLocation("online");
  }

  function togglePicked(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const durationMin = Number(duration);
  const isDurationValid = Number.isFinite(durationMin) && durationMin > 0;

  async function submit() {
    if (picked.length === 0) { toast.error(labels.pickStudents); return; }
    if (!datetime || !isDurationValid) { toast.error(labels.error); return; }
    setPending(true);
    try {
      const res = await createLesson({
        scheduledAt: fromDatetimeLocal(datetime),
        durationMin,
        locationType: location,
        studentIds: picked,
      });
      if (res.ok) {
        toast.success(labels.saved);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(`${labels.error}: ${res.error}`);
      }
    } catch {
      toast.error(labels.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{labels.title}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{labels.students}</span>
            {students.length === 0 ? (
              <Link href="/students" onClick={() => onOpenChange(false)}
                className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
                {labels.noStudents}
              </Link>
            ) : (
              <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border border-border p-2">
                {students.map((s) => (
                  <button key={s.id} type="button" onClick={() => togglePicked(s.id)}
                    className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      picked.includes(s.id) ? "bg-accent text-accent-foreground font-semibold" : "hover:bg-secondary"
                    }`}>
                    {s.name}{picked.includes(s.id) ? " ✓" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ql-dt">{labels.datetime}</Label>
            <Input id="ql-dt" type="datetime-local" value={datetime} onChange={(e) => setDatetime(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="ql-dur">{labels.duration}</Label>
            <Input id="ql-dur" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{labels.location}</span>
            <div className="flex gap-2">
              {(["online", "offline"] as const).map((loc) => (
                <Button key={loc} type="button" size="sm"
                  variant={location === loc ? "default" : "outline"}
                  onClick={() => setLocation(loc)}>
                  {loc === "online" ? labels.online : labels.offline}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>{labels.cancel}</Button>
          <Button onClick={submit} disabled={pending || picked.length === 0 || !datetime || !isDurationValid}>{labels.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
