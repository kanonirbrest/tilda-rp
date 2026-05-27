import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SITE_GATE_COOKIE,
  getSiteGatePassword,
  signSiteGateSession,
} from "@/lib/auth-site-gate";

const bodySchema = z.object({
  password: z.string(),
});

export async function POST(req: Request) {
  let password: string;
  try {
    password = bodySchema.parse(await req.json()).password;
  } catch {
    return NextResponse.json(
      { error: "BAD_REQUEST", message: "Ожидается JSON { password }" },
      { status: 400 },
    );
  }

  if (password !== getSiteGatePassword()) {
    return NextResponse.json({ error: "UNAUTHORIZED", message: "Неверный пароль" }, { status: 401 });
  }

  let token: string;
  try {
    token = await signSiteGateSession();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "SERVER_MISCONFIG", message: msg }, { status: 503 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SITE_GATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
