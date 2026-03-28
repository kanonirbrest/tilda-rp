import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setStaffCookie, signStaffSession } from "@/lib/auth-staff";

const schema = z.object({
  login: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION" }, { status: 400 });
  }

  const staff = await prisma.staffUser.findUnique({
    where: { login: parsed.data.login.trim() },
  });
  if (!staff) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const ok = await bcrypt.compare(parsed.data.password, staff.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const jwt = await signStaffSession(staff.id);
  await setStaffCookie(jwt);

  return NextResponse.json({ ok: true });
}
