"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatMinorUnits } from "@/lib/money";

type VerifyOk = {
  found: true;
  paid: boolean;
  used: boolean;
  usedAt: string | null;
  customerName: string;
  email: string;
  phone: string;
  slotTitle: string;
  startsAt: string;
  amountCents: number;
  /** Сумма для отображения, например «208.00 BYN». */
  amountDisplay?: string;
  currency: string;
  orderId: string;
};

export function QuickClient({ token }: { token: string }) {
  const [auth, setAuth] = useState<"unknown" | "yes" | "no">("unknown");
  const [data, setData] = useState<VerifyOk | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    setData(null);
    const res = await fetch("/api/staff/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });
    if (res.status === 401) {
      setAuth("no");
      return;
    }
    if (!res.ok) {
      setError("Ошибка запроса");
      return;
    }
    setAuth("yes");
    const json = (await res.json()) as { found?: boolean } & Partial<VerifyOk>;
    if (!json.found) {
      setNotFound(true);
      return;
    }
    setData(json as VerifyOk);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as { error?: string; usedAt?: string };
      if (res.status === 409) {
        setError(`Уже использован: ${json.usedAt || ""}`);
        await load();
        return;
      }
      if (!res.ok) {
        setError(json.error || "Ошибка");
        return;
      }
      await load();
    } catch {
      setError("Сеть");
    } finally {
      setBusy(false);
    }
  }

  if (auth === "unknown") {
    return <p className="px-4 py-8 text-sm text-zinc-600">Загрузка…</p>;
  }

  if (auth === "no") {
    const next = `/staff/quick?t=${encodeURIComponent(token)}`;
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10 text-sm sm:px-6">
        <p className="text-zinc-700">Войдите, чтобы проверить билет.</p>
        <a
          className="mt-4 inline-block font-medium text-zinc-900 underline"
          href={`/staff/login?next=${encodeURIComponent(next)}`}
        >
          Войти
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Проверка билета</h1>
        <Link href="/staff/scan" className="text-sm text-zinc-500 underline">
          Сканер
        </Link>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {notFound ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
          Билет не найден.
        </p>
      ) : null}

      {data ? (
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm">
          <div className="text-base font-semibold text-zinc-900">{data.customerName}</div>
          <div className="text-zinc-600">{data.slotTitle}</div>
          <div className="text-zinc-600">{data.startsAt}</div>
          <div className="text-zinc-600">
            {data.amountDisplay ?? formatMinorUnits(data.amountCents, data.currency)}
          </div>
          <div className="text-xs text-zinc-500">
            {data.email} · {data.phone}
          </div>
          <div className="mt-2 flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
            {!data.paid ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                Не оплачен
              </span>
            ) : null}
            {data.used ? (
              <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-800">
                Уже прошёл{data.usedAt ? ` · ${data.usedAt}` : ""}
              </span>
            ) : null}
          </div>
          {data.paid && !data.used ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void checkIn()}
              className="mt-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "…" : "Клиент прошёл"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
