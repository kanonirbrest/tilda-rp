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

function formatDateRu(dateKey: string): string {
  const parts = dateKey.split("-").map((x) => Number(x));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export default function NightOfMuseumsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
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
    <main className="nom-page">
      <div className="nom-page__bg" aria-hidden />
      <div className="nom-plain-checkout">
        <div className="nom-plain-section">
          <h1 className="nom-plain-heading">{pageTitle}</h1>
          {loading ? <p className="nom-plain-msg nom-plain-msg--muted">Загрузка слота...</p> : null}
          {!loading && error ? <p className="nom-plain-msg">{error}</p> : null}
          {!loading && !error && date && time ? (
            <>
              <p className="nom-plain-meta">{formatDateRu(date)}</p>
              <div className="nom-plain-times">
                <div className="nom-plain-time">{time}</div>
              </div>
            </>
          ) : null}
        </div>

        {!loading && !error ? (
          <form className="nom-plain-section nom-plain-form-slot" onSubmit={(e) => void onSubmit(e)}>
            <div className="nom-plain-ticket-row">
              <div className="nom-plain-ticket-text">
                <span className="nom-plain-ticket-title">Билеты</span>
                <span className="nom-plain-ticket-hint">Ночь музеев</span>
              </div>
              <div className="nom-plain-stepper">
                <button
                  type="button"
                  className="nom-plain-step"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1 || busy}
                  aria-label="Уменьшить количество"
                >
                  -
                </button>
                <span className="nom-plain-stepper-val">{qty}</span>
                <button
                  type="button"
                  className="nom-plain-step"
                  onClick={() => setQty((q) => Math.min(30, q + 1))}
                  disabled={busy}
                  aria-label="Увеличить количество"
                >
                  +
                </button>
              </div>
            </div>

            <div className="nom-plain-input-group">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                className="nom-input"
                autoComplete="name"
              />
            </div>
            <div className="nom-plain-input-group">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="nom-input"
                autoComplete="email"
              />
            </div>
            <div className="nom-plain-input-group">
              <input
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Телефон"
                className="nom-input"
                autoComplete="tel"
                inputMode="tel"
              />
            </div>

            <p className="nom-plain-total">
              Сумма заказа: <strong>{totalLabel}</strong>
            </p>

            {formError ? <p className="nom-plain-msg">{formError}</p> : null}

            <button type="submit" disabled={busy} className="nom-submit">
              {busy ? "Оформляем..." : "Перейти к оплате"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
