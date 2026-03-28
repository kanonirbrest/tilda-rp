import { NextResponse } from "next/server";
import { clearStaffCookie } from "@/lib/auth-staff";

export async function POST() {
  await clearStaffCookie();
  return NextResponse.json({ ok: true });
}
