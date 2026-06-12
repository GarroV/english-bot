import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getLoginTokenStatus } from "@/lib/auth/login-tokens";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "missing token" }, { status: 400 });
  try {
    const status = await getLoginTokenStatus(token);
    if (!status) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ status });
  } catch {
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
