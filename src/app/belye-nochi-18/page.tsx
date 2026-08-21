"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { PhoneCountryField } from "@/components/phone-country-field";
import { PolicyConsentField } from "@/components/policy-consent-field";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { normalizePromoCode } from "@/lib/promo-code";
import { BELYE_NOCHI_18_SLOT_KIND } from "@/lib/slot-kind";

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
  sessionLabels?: Record<string, string>;
  error?: string;
  hint?: string;
};

type QuoteResponse = {
  formattedTotal?: string;
  totalCents?: number;
  currency?: string;
  promo?: {
    applied?: boolean;
    hint?: string;
    error?: string;
    discountCents?: number;
    amountCents?: number;
    formattedAmount?: string;
  };
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

export default function BelyeNochi18Page() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [sessionTimeLabel, setSessionTimeLabel] = useState("");
  const [qty, setQty] = useState(1);
  const [quoteTotalLabel, setQuoteTotalLabel] = useState("—");
  const [quoteTotalCents, setQuoteTotalCents] = useState<number | null>(null);
  const [quoteCurrency, setQuoteCurrency] = useState("BYN");
  const [quotePending, setQuotePending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  /** Код, переданный в order-quote после «Применить». */
  const [promoForQuote, setPromoForQuote] = useState("");
  /** Промокод, подтверждённый ответом quote (applied === true). */
  const [promoConfirmed, setPromoConfirmed] = useState("");
  const [promoHint, setPromoHint] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [formError, setFormError] = useState("");
  const [policyConsent, setPolicyConsent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const calRes = await fetch(
          `/api/public/calendar?kind=${encodeURIComponent(BELYE_NOCHI_18_SLOT_KIND)}`,
        );
        const calJson = (await calRes.json()) as CalendarResponse;
        if (!calRes.ok) throw new Error(calJson.error ? String(calJson.error) : "calendar");

        const availableDays = sortDateKeysAsc(
          Object.entries(calJson.days)
            .filter(([, day]) => day.bookable)
            .map(([dk]) => dk),
        );
        const firstDay = availableDays[0];
        if (!firstDay) throw new Error("На это мероприятие нет доступных билетов.");

        const daySlotsRes = await fetch(
          `/api/public/day-slots?kind=${encodeURIComponent(BELYE_NOCHI_18_SLOT_KIND)}&date=${encodeURIComponent(firstDay)}`,
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
    setQuotePending(true);
    const promoQ = promoForQuote.trim();
    const promoSuffix = promoQ ? `&promoCode=${encodeURIComponent(promoQ)}` : "";
    const url =
      `/api/public/order-quote?kind=${encodeURIComponent(BELYE_NOCHI_18_SLOT_KIND)}` +
      `&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}&adult=${qty}&child=0&concession=0` +
      promoSuffix;
    fetch(url)
      .then(async (r) => ({ ok: r.ok, body: (await r.json()) as QuoteResponse }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        setQuotePending(false);
        if (
          !ok ||
          typeof body.formattedTotal !== "string" ||
          typeof body.totalCents !== "number"
        ) {
          setQuoteTotalLabel(body.hint || body.error || "Не удалось посчитать сумму");
          setQuoteTotalCents(null);
          if (body.promo?.hint) setPromoHint(body.promo.hint);
          return;
        }
        setQuoteTotalLabel(body.formattedTotal);
        setQuoteTotalCents(body.totalCents);
        setQuoteCurrency(body.currency || "BYN");
        if (body.promo?.applied === false && promoQ) {
          setPromoHint(body.promo.hint || "Промокод не применён");
          setPromoForQuote("");
          setPromoConfirmed("");
        } else if (body.promo?.applied === true) {
          setPromoHint(body.promo.hint || "");
          setPromoConfirmed(promoQ);
          if (typeof body.promo.amountCents === "number") {
            setQuoteTotalCents(body.promo.amountCents);
            if (typeof body.promo.formattedAmount === "string") {
              setQuoteTotalLabel(body.promo.formattedAmount);
            }
          }
        } else if (!promoQ) {
          setPromoConfirmed("");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuotePending(false);
          setQuoteTotalLabel("Не удалось посчитать сумму");
          setQuoteTotalCents(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [date, time, qty, promoForQuote]);

  const promoCheckoutBlocked =
    quotePending ||
    (Boolean(promoForQuote.trim()) &&
      normalizePromoCode(promoForQuote) !== normalizePromoCode(promoConfirmed));

  function applyPromo() {
    const code = promoInput.trim();
    setQuotePending(true);
    if (!code) {
      setPromoForQuote("");
      setPromoConfirmed("");
      setPromoHint("");
      return;
    }
    setPromoForQuote(code);
    setPromoConfirmed("");
    setPromoHint("");
  }

  function onPromoInputChange(value: string) {
    setPromoInput(value);
    const forQuote = promoForQuote.trim();
    if (!forQuote) return;
    if (normalizePromoCode(value) !== normalizePromoCode(forQuote)) {
      setQuotePending(true);
      setPromoForQuote("");
      setPromoConfirmed("");
      setPromoHint("");
    }
  }

  const unitPriceLabel = useMemo(() => {
    if (quotePending) return "…";
    if (quoteTotalCents == null || qty < 1) return "—";
    const unit = Math.round(quoteTotalCents / qty);
    return formatMoneyCents(unit, quoteCurrency);
  }, [quotePending, quoteTotalCents, qty, quoteCurrency]);

  const summaryLine = useMemo(() => {
    if (quoteTotalLabel.startsWith("Не удалось")) return null;
    if (quotePending || quoteTotalCents == null) {
      return `${qty} ${ticketsWord(qty)} на сумму …`;
    }
    return `${qty} ${ticketsWord(qty)} на сумму ${quoteTotalLabel}`;
  }, [qty, quotePending, quoteTotalCents, quoteTotalLabel]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date || !time) {
      setFormError("Слот для покупки пока недоступен.");
      return;
    }
    if (promoCheckoutBlocked) {
      setFormError("Дождитесь пересчёта суммы с промокодом.");
      return;
    }
    if (!policyConsent) {
      setFormError(DEI_POLICY_CONSENT_ERROR);
      return;
    }
    if (!isPhoneComplete(phoneCountryIso, phoneLocal)) {
      setFormError("Укажите корректный номер телефона.");
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotKind: BELYE_NOCHI_18_SLOT_KIND,
          date,
          time,
          adult: qty,
          child: 0,
          concession: 0,
          name: name.trim(),
          email: email.trim(),
          phone: toE164Phone(phoneCountryIso, phoneLocal),
          ...(promoConfirmed ? { promoCode: promoConfirmed } : {}),
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
          <h1 className="sv2-head__title">Белые ночи 18+</h1>
        </header>

        {loading ? <p className="nom-plain-msg nom-plain-msg--muted">Загрузка…</p> : null}
        {!loading && error ? <p className="nom-plain-msg">{error}</p> : null}

        {!loading && !error && date && time ? (
          <>
            <section className="nom-block nom-block--session" aria-label="Дата и время сеанса">
              <p className="nom-session-date">{formatDateShortRu(date)}</p>
              <p className="nom-session-time">Время сеанса {sessionTimeLabel}</p>
            </section>

            <form
              id="nom-checkout-form"
              className="nom-form-block nom-tilda-form t-form"
              onSubmit={(e) => void onSubmit(e)}
            >
              <section className="nom-block" aria-labelledby="bn18-tickets-label">
                <p id="bn18-tickets-label" className="nom-block-label">
                  Выбор билетов
                </p>
                <div className="nom-ticket-row">
                  <div className="nom-ticket-text">
                    <div className="nom-ticket-line">Стандартный билет {unitPriceLabel}</div>
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

              <section className="nom-block" aria-label="Промокод">
                <p className="nom-block-label">Промокод</p>
                <div className="sv2-promo-row">
                  <input
                    type="text"
                    className="sv2-promo-input"
                    placeholder="Промокод"
                    maxLength={64}
                    autoComplete="off"
                    value={promoInput}
                    onChange={(e) => onPromoInputChange(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="sv2-promo-apply"
                    disabled={busy || !promoInput.trim()}
                    onClick={applyPromo}
                  >
                    Применить
                  </button>
                </div>
                {promoHint ? <p className="sv2-promo-hint">{promoHint}</p> : null}
              </section>

              {summaryLine ? (
                <p className="nom-summary" aria-busy={quotePending}>
                  <strong>{summaryLine}</strong>
                </p>
              ) : quoteTotalLabel !== "—" ? (
                <p className="nom-summary nom-plain-msg--muted">{quoteTotalLabel}</p>
              ) : null}

              <div className="t-form__inputsbox">
                <div className="t-input-group t-input-group_em">
                  <div className="t-input-block">
                    <input
                      required
                      type="email"
                      name="email"
                      autoComplete="email"
                      aria-label="Почта для отправки билетов"
                      placeholder="Почта для отправки билетов"
                      className="t-input js-tilda-rule"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                    />
                    <div className="t-input-error" aria-hidden />
                  </div>
                </div>

                <div className="t-input-group t-input-group_nm">
                  <div className="t-input-block">
                    <input
                      required
                      type="text"
                      name="name"
                      autoComplete="name"
                      aria-label="Имя"
                      placeholder="Имя"
                      className="t-input js-tilda-rule"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={busy}
                    />
                    <div className="t-input-error" aria-hidden />
                  </div>
                </div>

                <div className="t-input-group t-input-group_ph">
                  <div className="t-input-block" style={{ overflow: "visible" }}>
                    <PhoneCountryField
                      countryIso={phoneCountryIso}
                      localValue={phoneLocal}
                      onCountryChange={setPhoneCountryIso}
                      onLocalChange={setPhoneLocal}
                      disabled={busy}
                    />
                    <div className="t-input-error" aria-hidden />
                  </div>
                </div>
              </div>

              <PolicyConsentField
                checked={policyConsent}
                onChange={(v) => {
                  setPolicyConsent(v);
                  if (v) setFormError("");
                }}
                disabled={busy}
              />

              {formError ? <p className="nom-plain-msg">{formError}</p> : null}

              <button
                type="submit"
                disabled={busy || !policyConsent || promoCheckoutBlocked}
                className="t-submit nom-submit"
              >
                {busy ? "Оформляем…" : "Перейти к оплате"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </main>
  );
}
