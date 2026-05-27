/** Сообщение для UI при сбое API (в т.ч. пустое тело при 500 без DATABASE_URL). */
export function apiFailureHint(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const o = body as { hint?: string; error?: string };
    if (typeof o.hint === "string" && o.hint.trim()) return o.hint;
    if (typeof o.error === "string" && o.error.trim()) return o.error;
  }

  if (status === 500 || status === 503) {
    return "Сервер не отвечает. Локально: скопируйте .env.example в .env.local, поднимите БД (docker compose up -d) и перезапустите npm run dev.";
  }
  if (status >= 400) {
    return `Ошибка сервера (${status})`;
  }
  return "Пустой ответ сервера";
}

/**
 * Безопасный разбор JSON из fetch: не бросает SyntaxError на пустом теле.
 */
export async function readResponseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    if (!res.ok) {
      throw new Error(apiFailureHint(res.status, null));
    }
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Некорректный ответ сервера");
  }
}
