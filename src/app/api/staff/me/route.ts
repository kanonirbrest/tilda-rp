import { NextResponse } from "next/server";
import { getStaffFromCookies } from "@/lib/auth-staff";

export async function GET() {
  const staff = await getStaffFromCookies();
  if (!staff) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  return NextResponse.json({ authenticated: true, login: staff.login });
}
