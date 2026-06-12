import { NextResponse } from "next/server";
import { createLoginToken } from "@/lib/auth/login-tokens";

export async function POST() {
  try {
    const created = await createLoginToken();
    return NextResponse.json(created);
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
