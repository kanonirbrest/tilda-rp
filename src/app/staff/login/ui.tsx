"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StaffLoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, password }),
      });
      if (!res.ok) {
        setError("Неверный логин или пароль");
        return;
      }
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-none flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Логин</span>
        <input
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-500"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-700">Пароль</span>
        <input
          type="password"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {loading ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
