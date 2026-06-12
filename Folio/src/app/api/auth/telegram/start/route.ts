import { NextResponse } from "next/server";
import { createLoginToken } from "@/lib/auth/login-tokens";

export async function POST() {
  const created = await createLoginToken();
  return NextResponse.json(created);
}
