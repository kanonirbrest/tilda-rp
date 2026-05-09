"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { NIGHT_OF_MUSEUMS_SLOT_KIND } from "@/lib/slot-kind";

type CalendarResponse = {
  timezone: string;
  kind: string;
  days: Record<string, { bookable: boolean; hover: string }>;
  error?: string;
  hint?: string;
};

type DaySlotsResponse = {
  timezone: string;
  kind: string;
  date: string;
  times: string[];
  error?: string;
  hint?: string;
};

type QuoteResponse = {
  formattedTotal?: string;
  error?: string;
  hint?: string;
};

function sortDateKeysAsc(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

export default function NightOfMuseumsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timezone, setTimezone] = useState("");
  const [qty, setQty] = useState(1);
  const [totalLabel, setTotalLabel] = useState("—");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const calRes = await fetch(`/api/public/calendar?kind=${encodeURIComponent(NIGHT_OF_MUSEUMS_SLOT_KIND)}`);
        const calJson = (await calRes.json()) as CalendarResponse;
        if (!calRes.ok) throw new Error(calJson.error ? String(calJson.error) : "calendar");

        const availableDays = sortDateKeysAsc(
          Object.entries(calJson.days)
            .filter(([, day]) => day.bookable)
            .map(([dk]) => dk),
        );
        const firstDay = availableDays[0];
        if (!firstDay) throw new Error("На эту акцию нет доступных билетов.");

        const daySlotsRes = await fetch(
          `/api/public/day-slots?kind=${encodeURIComponent(NIGHT_OF_MUSEUMS_SLOT_KIND)}&date=${encodeURIComponent(firstDay)}`,
        );
        const daySlotsJson = (await daySlotsRes.json()) as DaySlotsResponse;
        if (!daySlotsRes.ok) throw new Error(daySlotsJson.error ? String(daySlotsJson.error) : "day-slots");
        if (!Array.isArray(daySlotsJson.times) || daySlotsJson.times.length < 1) {
          throw new Error("Для выбранного дня нет доступного времени.");
        }

        if (!cancelled) {
          setDate(firstDay);
          setTime(daySlotsJson.times[0]!);
          setTimezone(daySlotsJson.timezone || calJson.timezone || "");
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Не удалось загрузить слоты.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!date || !time) return;
    setTotalLabel("...");
    const url =
      `/api/public/order-quote?kind=${encodeURIComponent(NIGHT_OF_MUSEUMS_SLOT_KIND)}` +
      `&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&adult=${qty}&child=0&concession=0`;
    fetch(url)
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as QuoteResponse }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok || typeof body.formattedTotal !== "string") {
          setTotalLabel(body.hint || body.error || "Не удалось посчитать сумму");
          return;
        }
        setTotalLabel(body.formattedTotal);
      })
      .catch(() => {
        if (!cancelled) setTotalLabel("Не удалось посчитать сумму");
      });
    return () => {
      cancelled = true;
    };
  }, [date, time, qty]);

  const pageTitle = useMemo(() => "Ночь музеев", []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date || !time) {
      setFormError("Слот для покупки пока недоступен.");
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotKind: NIGHT_OF_MUSEUMS_SLOT_KIND,
          date,
          time,
          adult: qty,
          child: 0,
          concession: 0,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const body = (await r.json()) as { redirectUrl?: string; hint?: string; error?: string };
      if (!r.ok || !body.redirectUrl) {
        setFormError(body.hint || body.error || `Ошибка оформления (${r.status})`);
        return;
      }
      window.location.href = body.redirectUrl;
    } catch {
      setFormError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{pageTitle}</h1>
      <p className="mt-2 text-sm text-zinc-600">Покупка билетов на специальный слот.</p>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        {loading ? <p className="text-sm text-zinc-600">Загрузка слота...</p> : null}
        {!loading && error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error ? (
          <>
            <div className="space-y-1">
              <p className="text-sm text-zinc-500">Дата</p>
              <p className="font-medium text-zinc-900">{date}</p>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm text-zinc-500">Время</p>
              <p className="font-medium text-zinc-900">{time}</p>
            </div>
            {timezone ? <p className="mt-2 text-xs text-zinc-500">Часовой пояс: {timezone}</p> : null}

            <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
              <div>
                <p className="mb-2 text-sm text-zinc-500">Количество билетов</p>
                <div className="inline-flex items-center rounded-xl border border-zinc-300">
                  <button
                    type="button"
                    className="h-10 w-10 text-lg text-zinc-700 disabled:opacity-40"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1 || busy}
                  >
                    -
                  </button>
                  <span className="min-w-12 px-2 text-center font-semibold">{qty}</span>
                  <button
                    type="button"
                    className="h-10 w-10 text-lg text-zinc-700 disabled:opacity-40"
                    onClick={() => setQty((q) => Math.min(30, q + 1))}
                    disabled={busy}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ваше имя"
                  className="h-11 rounded-xl border border-zinc-300 px-3 text-sm"
                />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="h-11 rounded-xl border border-zinc-300 px-3 text-sm"
                />
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Телефон"
                  className="h-11 rounded-xl border border-zinc-300 px-3 text-sm"
                />
              </div>

              <div className="rounded-xl bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
                Сумма заказа: <span className="font-semibold text-zinc-900">{totalLabel}</span>
              </div>

              {formError ? <p className="text-sm text-rose-600">{formError}</p> : null}

              <button
                type="submit"
                disabled={busy}
                className="h-11 w-full rounded-xl bg-emerald-800 px-4 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                {busy ? "Оформляем..." : "Перейти к оплате"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
