import { jsonPublicReadResponse } from "@/lib/public-orders-cors";

export function publicApiErrorHint(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("DATABASE_URL") || msg.includes("Environment variable not found")) {
    return "База данных не настроена: скопируйте .env.example в .env.local и выполните docker compose up -d.";
  }
  if (msg.includes("Can't reach database") || msg.includes("ECONNREFUSED")) {
    return "Не удаётся подключиться к PostgreSQL. Запустите docker compose up -d.";
  }
  return "Внутренняя ошибка сервера";
}

export function jsonPublicApiError(req: Request, err: unknown, status = 503) {
  console.error("[public-api]", err);
  return jsonPublicReadResponse(
    req,
    { error: "SERVER_ERROR", hint: publicApiErrorHint(err) },
    status,
  );
}
