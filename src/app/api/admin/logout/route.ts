import { NextResponse } from "next/server";
import { adminCorsHeaders } from "@/lib/admin-api";
import { ADMIN_UI_COOKIE } from "@/lib/auth-admin-ui";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true }, { headers: adminCorsHeaders(req) });
  res.cookies.set(ADMIN_UI_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
