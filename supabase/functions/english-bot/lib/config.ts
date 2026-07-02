// Bot configuration resolved from env at module load. Fail-fast on a missing/invalid ADMIN_USER_ID:
// Number(undefined) is NaN and `id === NaN` is always false, so a bad value would silently lock the
// admin out of every gated command (a confusing "Нет доступа") instead of a clear boot failure.
const rawAdminId = Deno.env.get("ADMIN_USER_ID");
const adminId = Number(rawAdminId);
if (!rawAdminId || !Number.isInteger(adminId)) {
  throw new Error("ADMIN_USER_ID env var is not a valid integer");
}

// Telegram user id of the single admin (invite creation, /users, /setup).
export const ADMIN_ID = adminId;
