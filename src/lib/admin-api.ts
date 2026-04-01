import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_UI_COOKIE, verifyAdminUiSessionToken } from "@/lib/auth-admin-ui";

/** CORS для запросов к /api/admin/* с другого origin: ADMIN_CORS_ORIGIN (через запятую). С /admin на том же домене не нужен. */
export function adminCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  };

  // Локально: любой порт Vite (5173, 5174, …) и любой localhost / LAN — иначе браузер даёт «Failed to fetch»
  if (process.env.NODE_ENV === "development") {
    headers["Access-Control-Allow-Origin"] = origin || "*";
    return headers;
  }

  const allowed =
    process.env.ADMIN_CORS_ORIGIN?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  let allow = "";
  if (allowed.length > 0) {
    if (origin && allowed.includes(origin)) allow = origin;
    else if (allowed.length === 1) allow = allowed[0]!;
  } else {
    allow = "*";
  }
  if (!allow) allow = "*";
  headers["Access-Control-Allow-Origin"] = allow;
  return headers;
}

export function jsonWithCors(req: Request, data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: adminCorsHeaders(req),
  });
}

export function adminUnauthorized(req: Request): NextResponse {
  return NextResponse.json(
    {
      error: "UNAUTHORIZED",
      message:
        "Войдите на странице /admin или передайте Authorization: Bearer (ADMIN_API_SECRET). На сервере должны быть заданы ADMIN_API_SECRET и SESSION_SECRET.",
    },
    { status: 401, headers: adminCorsHeaders(req) },
  );
}

export function adminDisabled(req: Request): NextResponse {
  return NextResponse.json(
    {
      error: "ADMIN_DISABLED",
      message: "Задайте в окружении ADMIN_API_SECRET (длинная случайная строка) для доступа к админ-API.",
    },
    { status: 503, headers: adminCorsHeaders(req) },
  );
}

function verifyAdminBearer(req: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET?.trim();
  if (!secret) return false;
  const h = req.headers.get("authorization");
  return h === `Bearer ${secret}`;
}

async function verifyAdminCookie(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(ADMIN_UI_COOKIE)?.value;
  if (!raw) return false;
  return verifyAdminUiSessionToken(raw);
}

/** Bearer ADMIN_API_SECRET или cookie после входа на /admin */
export async function requireAdmin(req: Request): Promise<NextResponse | null> {
  if (!process.env.ADMIN_API_SECRET?.trim()) {
    return adminDisabled(req);
  }
  if (verifyAdminBearer(req)) return null;
  if (await verifyAdminCookie()) return null;
  return adminUnauthorized(req);
}
