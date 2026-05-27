import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SITE_GATE_COOKIE = "dei_site_gate";

function sessionSecretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET должен быть задан (минимум 16 символов)");
  }
  return new TextEncoder().encode(s);
}

/** Пароль входа на главную (/). Переопределяется через SITE_GATE_PASSWORD. */
export function getSiteGatePassword(): string {
  return process.env.SITE_GATE_PASSWORD?.trim() || "121212";
}

export async function signSiteGateSession(): Promise<string> {
  return new SignJWT({ siteGate: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(sessionSecretKey());
}

export async function verifySiteGateSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey());
    return payload.siteGate === true;
  } catch {
    return false;
  }
}

export async function hasSiteGateAccess(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(SITE_GATE_COOKIE)?.value;
  if (!token) return false;
  return verifySiteGateSessionToken(token);
}
