import { SignJWT, jwtVerify } from "jose";

export const ADMIN_UI_COOKIE = "admin_ui_session";

function sessionSecretKey(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET должен быть задан (минимум 16 символов)");
  }
  return new TextEncoder().encode(s);
}

/** JWT после успешной проверки ADMIN_API_SECRET в POST /api/admin/login */
export async function signAdminUiSession(): Promise<string> {
  return new SignJWT({ adminUi: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecretKey());
}

export async function verifyAdminUiSessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, sessionSecretKey());
    return payload.adminUi === true;
  } catch {
    return false;
  }
}
