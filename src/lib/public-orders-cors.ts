import { NextResponse } from "next/server";

/**
 * CORS для POST /api/orders с Тильды (или другого origin).
 * В продакшене задайте PUBLIC_ORDERS_CORS_ORIGIN — полные origin через запятую, например:
 * https://project12345.tilda.ws,https://www.dei.by
 */
export function publicOrdersCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };

  if (process.env.NODE_ENV === "development") {
    headers["Access-Control-Allow-Origin"] = origin || "*";
    return headers;
  }

  const allowed =
    process.env.PUBLIC_ORDERS_CORS_ORIGIN?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function jsonOrdersResponse(req: Request, data: unknown, status: number): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: publicOrdersCorsHeaders(req),
  });
}
