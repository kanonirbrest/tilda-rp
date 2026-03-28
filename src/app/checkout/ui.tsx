"use client";

import { useState } from "react";

export function CheckoutForm({ slotId }: { slotId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!slotId?.trim()) {
      setError("Слот не передан. Откройте страницу снова из списка билетов (/tickets).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId, name, email, phone }),
      });
      const raw = await res.text();
      type FieldErr = Record<string, string[] | undefined>;
      let data: {
        redirectUrl?: string;
        error?: string;
        hint?: string;
        details?: { fieldErrors?: FieldErr; formErrors?: string[] };
      } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as typeof data;
        } catch {
          setError(
            `Сервер вернул ответ без JSON (код ${res.status}). Обычно это значит падение API — смотрите терминал с npm run dev.`,
          );
          return;
        }
      }
      if (!res.ok) {
        if (data.error === "VALIDATION" && data.details?.fieldErrors) {
          const ru: Record<string, string> = {
            slotId: "Слот",
            name: "Имя",
            email: "Email",
            phone: "Телефон",
          };
          const parts = Object.entries(data.details.fieldErrors).flatMap(([key, msgs]) =>
            (msgs ?? []).map((m) => `${ru[key] ?? key}: ${m}`),
          );
          setError(parts.length ? parts.join(". ") : (data.hint ?? data.error ?? "Проверьте поля"));
        } else {
          setError(data.hint || data.error || `Ошибка оформления (${res.status})`);
        }
        return;
      }
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setError("Нет redirectUrl в ответе");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const looksLikeNetwork =
        err instanceof TypeError &&
        (/fetch|Load failed|NetworkError|Failed to load resource|network/i.test(msg) ||
          msg.length === 0);
      if (looksLikeNetwork) {
        setError(
          "Браузер не смог достучаться до сервера. Запустите в папке проекта `docker compose up -d` и `npm run dev`, откройте сайт по тому же URL, что в терминале (тот же хост и порт, обычно http://localhost:3000).",
        );
      } else {
        setError(msg || "Неизвестная ошибка");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-none flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Имя</span>
        <input
          required
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Email</span>
        <input
          required
          type="email"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-500"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Телефон</span>
        <input
          required
          type="tel"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-500"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Отправка…" : "Купить"}
      </button>
    </form>
  );
}
