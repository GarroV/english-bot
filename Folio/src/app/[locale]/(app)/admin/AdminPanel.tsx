"use client";

import { Fragment, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSignupInvite, revokeSignupInvite, setTutorAccess } from "@/lib/admin/actions";
import type { SignupInviteRow, WorkspaceOverview } from "@/lib/admin/queries";
import { formatDate } from "@/lib/format/date";

interface Labels {
  invitesTitle: string; note: string; ttlDays: string; create: string; created: string;
  copy: string; copied: string; link: string; statusPending: string; statusUsed: string;
  expires: string; usedBy: string; revoke: string; revoked: string; noInvites: string;
  workspacesTitle: string; wsName: string; tutor: string; students: string; lessons: string;
  createdAt: string; noWorkspaces: string; saveError: string;
  accessRevoke: string; accessRestore: string; accessRevokedBadge: string;
  accessConfirmRevoke: string; accessRevokedToast: string; accessRestoredToast: string;
  statsToggle: string; statsLessonsMonth: string; statsLessonsLine: string;
  statsGenerations: string; statsCountLine: string; statsTemplates: string;
  statsLastActivity: string; statsNever: string;
}

// Подстановка "{name}"-плейсхолдеров в raw-шаблоны next-intl на клиенте (как fill в StudentCards).
const fillStat = (tpl: string, vars: Record<string, string | number>) =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

// Мини-блок статистики в раскрытой строке воркспейса (#77).
function StatBlock({ title, line }: { title: string; line: string }) {
  return (
    <div className="rounded-xl bg-background/60 px-3.5 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-0.5 text-sm font-medium tabular-nums">{line}</p>
    </div>
  );
}

export function AdminPanel({ invites, workspaces, labels, locale, origin }: {
  invites: SignupInviteRow[];
  workspaces: WorkspaceOverview[];
  labels: Labels;
  locale: string;
  origin: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [ttl, setTtl] = useState("14");
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [statsFor, setStatsFor] = useState<string | null>(null);

  const linkFor = (token: string) => `${origin}/${locale}/invite/${token}`;

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token));
      setCopied(token);
      toast.success(labels.copied);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
    } catch {
      toast.error(labels.saveError);
    }
  }

  async function onCreate() {
    setPending(true);
    try {
      const res = await createSignupInvite({ note: note.trim() || undefined, ttlDays: Number(ttl) || 14 });
      if (res.ok) {
        toast.success(labels.created);
        setNote("");
        if (res.token) await copy(res.token);
        router.refresh();
      } else {
        toast.error(`${labels.saveError}: ${res.error}`);
      }
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  // Отзыв/восстановление доступа репетитора (#76): подтверждение — на отзыв, восстановление сразу.
  async function onAccessToggle(w: WorkspaceOverview) {
    if (!w.owner_user_id) return;
    const revoking = !w.tutor_disabled;
    if (revoking && !window.confirm(labels.accessConfirmRevoke.replace("{name}", w.tutor_name ?? w.name))) return;
    setPending(true);
    try {
      const res = await setTutorAccess(w.owner_user_id, revoking);
      if (res.ok) {
        toast.success(revoking ? labels.accessRevokedToast : labels.accessRestoredToast);
        router.refresh();
      } else {
        toast.error(`${labels.saveError}: ${res.error}`);
      }
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  async function onRevoke(id: string) {
    setPending(true);
    try {
      const res = await revokeSignupInvite(id);
      if (res.ok) { toast.success(labels.revoked); router.refresh(); }
      else toast.error(`${labels.saveError}: ${res.error}`);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Invites */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-2xl font-bold">{labels.invitesTitle}</h2>
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 220 }}>
            <Label htmlFor="inv-note">{labels.note}</Label>
            <Input id="inv-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="inv-ttl">{labels.ttlDays}</Label>
            <Input id="inv-ttl" inputMode="numeric" value={ttl} onChange={(e) => setTtl(e.target.value)} />
          </div>
          <Button onClick={onCreate} disabled={pending}>{labels.create}</Button>
        </div>

        {invites.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.noInvites}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {invites.map((inv) => {
              const isPending = inv.status === "pending";
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${isPending ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"}`}>
                        {isPending ? labels.statusPending : labels.statusUsed}
                      </span>
                      {inv.note && <span className="truncate text-sm font-medium">{inv.note}</span>}
                    </div>
                    <code className="max-w-full truncate text-xs text-muted-foreground">{linkFor(inv.token)}</code>
                    <span className="text-xs text-muted-foreground">
                      {labels.expires} {formatDate(inv.expires_at)}
                      {inv.used_by_name ? ` · ${labels.usedBy}: ${inv.used_by_name}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isPending && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => copy(inv.token)}>
                          {copied === inv.token ? labels.copied : labels.copy}
                        </Button>
                        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRevoke(inv.id)}>{labels.revoke}</Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Workspaces */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-2xl font-bold">{labels.workspacesTitle}</h2>
        {workspaces.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">{labels.noWorkspaces}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left">
                  <th className="p-3 font-semibold">{labels.wsName}</th>
                  <th className="p-3 font-semibold">{labels.tutor}</th>
                  <th className="p-3 font-semibold">{labels.students}</th>
                  <th className="p-3 font-semibold">{labels.lessons}</th>
                  <th className="p-3 font-semibold">{labels.createdAt}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {workspaces.map((w) => (
                  <Fragment key={w.id}>
                    <tr className={`border-b border-border last:border-0 ${w.tutor_disabled ? "opacity-60" : ""}`}>
                      <td className="p-3 font-medium">
                        <button type="button" onClick={() => setStatsFor((v) => (v === w.id ? null : w.id))}
                          aria-expanded={statsFor === w.id} aria-label={labels.statsToggle}
                          className="inline-flex items-center gap-1.5 hover:underline">
                          <span aria-hidden className="text-xs text-muted-foreground">{statsFor === w.id ? "▾" : "▸"}</span>
                          {w.name}
                        </button>
                      </td>
                      <td className="p-3">
                        {w.tutor_name ?? "—"}{w.tutor_telegram ? ` · ${w.tutor_telegram}` : ""}
                        {w.tutor_disabled && (
                          <span className="ml-2 rounded-full bg-destructive/12 px-2 py-0.5 text-xs font-bold text-destructive">
                            {labels.accessRevokedBadge}
                          </span>
                        )}
                      </td>
                      <td className="p-3">{w.students}</td>
                      <td className="p-3">{w.lessons}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(w.created_at)}</td>
                      <td className="p-3 text-right">
                        {w.owner_user_id && (
                          <Button variant={w.tutor_disabled ? "outline" : "ghost"} size="sm" disabled={pending}
                            onClick={() => onAccessToggle(w)}>
                            {w.tutor_disabled ? labels.accessRestore : labels.accessRevoke}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {statsFor === w.id && (
                      <tr className="border-b border-border bg-secondary/30 last:border-0">
                        <td colSpan={6} className="p-4">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <StatBlock title={labels.statsLessonsMonth}
                              line={fillStat(labels.statsLessonsLine, {
                                done: w.stats.monthLessonsDone, cancelled: w.stats.monthLessonsCancelled, upcoming: w.stats.monthLessonsUpcoming,
                              })} />
                            <StatBlock title={labels.statsGenerations}
                              line={fillStat(labels.statsCountLine, { month: w.stats.monthGenerations, total: w.stats.totalGenerations })} />
                            <StatBlock title={labels.statsTemplates}
                              line={fillStat(labels.statsCountLine, { month: w.stats.monthTemplates, total: w.stats.totalTemplates })} />
                            <StatBlock title={labels.statsLastActivity}
                              line={w.stats.lastActivityAt ? formatDate(w.stats.lastActivityAt) : labels.statsNever} />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
