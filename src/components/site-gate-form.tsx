"use client";

import { FormEvent, useState } from "react";

export function SiteGateForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/site-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = (await r.json()) as { message?: string; error?: string };
      if (!r.ok) {
        setError(body.message || body.error || "Неверный пароль");
        return;
      }
      window.location.reload();
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-sm flex-col items-center justify-center gap-6 px-4 py-20">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-900">DEI Tickets</h1>
        <p className="mt-2 text-sm text-zinc-600">Введите пароль для доступа к навигации</p>
      </div>
      <form onSubmit={(ev) => void onSubmit(ev)} className="flex w-full flex-col gap-3">
        <label className="sr-only" htmlFor="site-gate-password">
          Пароль
        </label>
        <input
          id="site-gate-password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          disabled={busy}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20"
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
        >
          {busy ? "Проверяем…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
