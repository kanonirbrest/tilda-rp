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
  /** Для NIGHT_OF_MUSEUMS: ключ HH:MM → «21:00 - 00:00» из названия слота */
  sessionLabels?: Record<string, string>;
  error?: string;
  hint?: string;
};

type QuoteResponse = {
  formattedTotal?: string;
  totalCents?: number;
  currency?: string;
  error?: string;
  hint?: string;
};

function sortDateKeysAsc(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function formatDateShortRu(dateKey: string): string {
  const parts = dateKey.split("-").map((x) => Number(x));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return dateKey;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatMoneyCents(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency.length === 3 ? currency : "BYN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function ticketsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "билетов";
  if (mod10 === 1) return "билет";
  if (mod10 >= 2 && mod10 <= 4) return "билета";
  return "билетов";
}

export default function NightOfMuseumsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  /** Текст после «Время сеанса » — диапазон из API или время начала */
  const [sessionTimeLabel, setSessionTimeLabel] = useState("");
  const [qty, setQty] = useState(1);
  const [quoteTotalLabel, setQuoteTotalLabel] = useState("—");
  const [quoteTotalCents, setQuoteTotalCents] = useState<number | null>(null);
  const [quoteCurrency, setQuoteCurrency] = useState("BYN");
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
          const t0 = daySlotsJson.times[0]!;
          setDate(firstDay);
          setTime(t0);
          setSessionTimeLabel(daySlotsJson.sessionLabels?.[t0] ?? t0);
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
    setQuoteTotalLabel("...");
    setQuoteTotalCents(null);
    const url =
      `/api/public/order-quote?kind=${encodeURIComponent(NIGHT_OF_MUSEUMS_SLOT_KIND)}` +
      `&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&adult=${qty}&child=0&concession=0`;
    fetch(url)
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as QuoteResponse }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (
          !ok ||
          typeof body.formattedTotal !== "string" ||
          typeof body.totalCents !== "number"
        ) {
          setQuoteTotalLabel(body.hint || body.error || "Не удалось посчитать сумму");
          setQuoteTotalCents(null);
          return;
        }
        setQuoteTotalLabel(body.formattedTotal);
        setQuoteTotalCents(body.totalCents);
        setQuoteCurrency(body.currency || "BYN");
      })
      .catch(() => {
        if (!cancelled) {
          setQuoteTotalLabel("Не удалось посчитать сумму");
          setQuoteTotalCents(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, time, qty]);

  const unitPriceLabel = useMemo(() => {
    if (quoteTotalCents == null || qty < 1) return "—";
    const unit = Math.round(quoteTotalCents / qty);
    return formatMoneyCents(unit, quoteCurrency);
  }, [quoteTotalCents, qty, quoteCurrency]);

  const summaryLine = useMemo(() => {
    if (quoteTotalCents == null || quoteTotalLabel === "..." || quoteTotalLabel.startsWith("Не удалось")) {
      return null;
    }
    return `${qty} ${ticketsWord(qty)} на сумму ${quoteTotalLabel}`;
  }, [qty, quoteTotalCents, quoteTotalLabel]);

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

      <div className="nom-shell">
        <header className="nom-head">
          <h1 className="nom-head__title">Ночь музеев</h1>
        </header>

        {loading ? <p className="nom-plain-msg nom-plain-msg--muted">Загрузка...</p> : null}
        {!loading && error ? <p className="nom-plain-msg">{error}</p> : null}

        {!loading && !error && date && time ? (
          <>
            <section className="nom-block" aria-labelledby="nom-datetime-label">
              <p id="nom-datetime-label" className="nom-block-label">
                Выбор даты и времени
              </p>
              <div className="nom-date-row">
                <div className="nom-chip nom-chip--selected">{formatDateShortRu(date)}</div>
              </div>
              <p className="nom-session-time">
                Время сеанса {sessionTimeLabel}
              </p>
            </section>

            <form className="nom-form-block" onSubmit={(e) => void onSubmit(e)}>
              <section className="nom-block" aria-labelledby="nom-tickets-label">
                <p id="nom-tickets-label" className="nom-block-label">
                  Выбор билетов
                </p>
                <div className="nom-ticket-row">
                  <div className="nom-ticket-text">
                    <div className="nom-ticket-line">
                      Стандартный билет {unitPriceLabel}
                    </div>
                  </div>
                  <div className="nom-qty">
                    <button
                      type="button"
                      className="nom-qty-btn"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      disabled={qty <= 1 || busy}
                      aria-label="Уменьшить количество"
                    >
                      −
                    </button>
                    <span className="nom-qty-ring">{qty}</span>
                    <button
                      type="button"
                      className="nom-qty-btn"
                      onClick={() => setQty((q) => Math.min(30, q + 1))}
                      disabled={busy}
                      aria-label="Увеличить количество"
                    >
                      +
                    </button>
                  </div>
                </div>
              </section>

              {summaryLine ? (
                <p className="nom-summary">
                  <strong>{summaryLine}</strong>
                </p>
              ) : quoteTotalLabel !== "—" && quoteTotalLabel !== "..." ? (
                <p className="nom-summary nom-plain-msg--muted">{quoteTotalLabel}</p>
              ) : null}

              <div className="nom-plain-input-group">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Почта для отправки билетов"
                  className="nom-input"
                  autoComplete="email"
                />
              </div>
              <div className="nom-plain-input-group">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Имя"
                  className="nom-input"
                  autoComplete="name"
                />
              </div>
              <div className="nom-plain-input-group">
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+375 (00) 000-00-00"
                  className="nom-input"
                  autoComplete="tel"
                  inputMode="tel"
                />
              </div>

              {formError ? <p className="nom-plain-msg">{formError}</p> : null}

              <button type="submit" disabled={busy} className="nom-submit">
                {busy ? "Оформляем..." : "Перейти к оплате"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
