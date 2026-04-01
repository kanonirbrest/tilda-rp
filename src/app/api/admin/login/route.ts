import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCorsHeaders, adminDisabled, jsonWithCors } from "@/lib/admin-api";
import { ADMIN_UI_COOKIE, signAdminUiSession } from "@/lib/auth-admin-ui";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

const bodySchema = z.object({
  secret: z.string(),
});

export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_API_SECRET?.trim();
  if (!adminSecret) return adminDisabled(req);

  let secret: string;
  try {
    secret = bodySchema.parse(await req.json()).secret;
  } catch {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: "Ожидается JSON { secret }" }, { status: 400 });
  }

  if (secret !== adminSecret) {
    return jsonWithCors(req, { error: "UNAUTHORIZED", message: "Неверный секрет" }, { status: 401 });
  }

  let token: string;
  try {
    token = await signAdminUiSession();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "SERVER_MISCONFIG", message: msg },
      { status: 503, headers: adminCorsHeaders(req) },
    );
  }

  const res = NextResponse.json({ ok: true }, { headers: adminCorsHeaders(req) });
  res.cookies.set(ADMIN_UI_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
