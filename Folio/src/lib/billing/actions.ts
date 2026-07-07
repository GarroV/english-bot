"use server";

import { createClient } from "@/lib/supabase/server";
import { paymentInputSchema, chargeInputSchema, type PaymentInput, type ChargeInput } from "./schema";

export type BillingResult = { ok: true } | { ok: false; error: string };

export async function recordPayment(input: PaymentInput): Promise<BillingResult> {
  const parsed = paymentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };
  const v = parsed.data;
  const { error } = await supabase.from("folio_student_payments").insert({
    workspace_id: workspaceId,
    student_id: v.studentId,
    amount: v.amount,
    type: "payment",
    note: v.note ?? null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Ручное начисление вне занятий (lesson_id NULL): доплата +X / скидка −X (знак здесь).
export async function recordCharge(input: ChargeInput): Promise<BillingResult> {
  const parsed = chargeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "invalid input" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data: profile } = await supabase
    .from("folio_users").select("workspace_id").eq("id", user.id).maybeSingle();
  const workspaceId = profile?.workspace_id as string | undefined;
  if (!workspaceId) return { ok: false, error: "no workspace" };
  const v = parsed.data;
  const { error } = await supabase.from("folio_student_payments").insert({
    workspace_id: workspaceId,
    student_id: v.studentId,
    amount: v.kind === "discount" ? -v.amount : v.amount,
    type: "charge",
    note: v.note ?? null,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Delete a ledger entry (manual correction). RLS scopes deletion to the workspace.
export async function deleteEntry(id: string): Promise<BillingResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };
  const { data, error } = await supabase
    .from("folio_student_payments").delete().eq("id", id).select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "not found" };
  return { ok: true };
}
