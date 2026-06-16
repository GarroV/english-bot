import { getTranslations } from "next-intl/server";
import { validateSignupInvite } from "@/lib/auth/signup-invites";
import { LoginPanel } from "../../login/LoginPanel";

// Public invite page: validates a signup-invite token and lets the invitee register
// (create their own workspace) by logging in with Telegram. Reuses LoginPanel.
export default async function InvitePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const invite = await validateSignupInvite(token);
  const t = await getTranslations("Invite");

  if (!invite) {
    return (
      <main className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold">{t("invalidTitle")}</h1>
          <p className="mt-2 text-muted-foreground">{t("invalidBody")}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent">
          <span className="h-4 w-4 rounded-full bg-primary" aria-hidden />
        </div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        <div className="mt-6">
          <LoginPanel
            inviteToken={token}
            redirectTo="/schedule"
            labels={{
              button: t("button"),
              waiting: t("waiting"),
              expired: t("expired"),
              error: t("error"),
            }}
          />
        </div>
      </div>
    </main>
  );
}
