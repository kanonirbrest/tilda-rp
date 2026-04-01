import { NextResponse } from "next/server";

/** CORS для статической админки (GitHub Pages): задайте ADMIN_CORS_ORIGIN=https://user.github.io */
export function adminCorsHeaders(req: Request): Record<string, string> {
  const allowed =
    process.env.ADMIN_CORS_ORIGIN?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const origin = req.headers.get("origin");
  let allow = "";
  if (allowed.length > 0) {
    if (origin && allowed.includes(origin)) allow = origin;
    else if (allowed.length === 1) allow = allowed[0]!;
  } else {
    allow = "*";
  }
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  };
}

export function jsonWithCors(req: Request, data: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: adminCorsHeaders(req),
  });
}

export function adminUnauthorized(req: Request): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Нужен заголовок Authorization: Bearer и переменная ADMIN_API_SECRET на сервере." },
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

export function verifyAdminSecret(req: Request): boolean {
  const secret = process.env.ADMIN_API_SECRET?.trim();
  if (!secret) return false;
  const h = req.headers.get("authorization");
  return h === `Bearer ${secret}`;
}

export function requireAdmin(req: Request): NextResponse | null {
  if (!process.env.ADMIN_API_SECRET?.trim()) {
    return adminDisabled(req);
  }
  if (!verifyAdminSecret(req)) {
    return adminUnauthorized(req);
  }
  return null;
}
