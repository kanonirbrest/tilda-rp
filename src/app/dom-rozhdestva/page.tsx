"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PaymentRetryNotice } from "@/components/payment-retry-notice";
import { PhoneCountryField } from "@/components/phone-country-field";
import { PolicyConsentField } from "@/components/policy-consent-field";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";
import { readResponseJson } from "@/lib/read-response-json";
import { formatDateKeyRu, normalizeTimeInput } from "@/lib/exhibition-time";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { normalizePromoCode } from "@/lib/promo-code";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";

type CalendarResponse = {
  timezone: string;
  days: Record<string, { bookable: boolean; hover: string }>;
  error?: string;
  hint?: string;
};

type DaySlotsResponse = {
  date: string;
  times: string[];
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

type CalendarDayCell = {
  dateKey: string;
  day: number;
  bookable: boolean;
  hover: string;
};

type MonthGroup = {
  key: string;
  title: string;
  days: CalendarDayCell[];
};

const MONTH_NOMINATIVE = [
  "",
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const WEEKDAY_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

/** Не показывать прошедшие сеансы сегодня и прошлые дни (как на /buy-tickets-smr). */
const PUBLIC_API_HIDE_PAST = "hidePastTimes=1";

const MAX_TICKETS = 30;

function sortDateKeysAsc(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** пн–вс по календарной дате YYYY-MM-DD (без сдвига TZ). */
function weekdayShortRu(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const wd = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return WEEKDAY_SHORT_RU[wd] ?? "";
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

/** Дни из календаря по месяцам; в календаре уже только дни с сеансами. */
function groupDays(days: Record<string, { bookable: boolean; hover: string }>): MonthGroup[] {
  const byMonth = new Map<string, CalendarDayCell[]>();
  for (const dateKey of sortDateKeysAsc(Object.keys(days))) {
    const monthKey = dateKey.slice(0, 7);
    const list = byMonth.get(monthKey) ?? [];
    list.push({
      dateKey,
      day: Number(dateKey.slice(8, 10)),
      bookable: days[dateKey]!.bookable,
      hover: days[dateKey]!.hover,
    });
    byMonth.set(monthKey, list);
  }
  return [...byMonth.entries()].map(([key, dayList]) => ({
    key,
    title: `${MONTH_NOMINATIVE[Number(key.slice(5, 7))] ?? ""} ${key.slice(0, 4)}`,
    days: dayList,
  }));
}

/** Ссылка «вернуться к сеансу» после неуспешной оплаты: ?date=&time=&adult= */
function readQuerySelection(): { date: string; time: string; count: number } | null {
  const sp = new URLSearchParams(window.location.search);
  const dateRaw = sp.get("date")?.trim() ?? "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : "";
  const count = Number.parseInt(sp.get("adult") ?? "", 10);
  if (!date && !Number.isFinite(count)) return null;
  return {
    date,
    time: normalizeTimeInput(sp.get("time") ?? "") ?? "",
    count: Number.isFinite(count) && count > 0 && count <= MAX_TICKETS ? count : 0,
  };
}

export default function DomRozhdestvaPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [timesLoading, setTimesLoading] = useState(false);

  /** Количество билетов «Единый». В API уходит как adult. */
  const [count, setCount] = useState(0);

  const [unitLabel, setUnitLabel] = useState("—");
  const [quoteTotalLabel, setQuoteTotalLabel] = useState("—");
  const [quoteTotalCents, setQuoteTotalCents] = useState<number | null>(null);
  const [quotePending, setQuotePending] = useState(false);

  const [promoInput, setPromoInput] = useState("");
  /** Код, переданный в order-quote после «Применить». */
  const [promoForQuote, setPromoForQuote] = useState("");
  /** Каждое «Применить» заново запускает расчёт, даже если код не изменился. */
  const [promoQuoteNonce, setPromoQuoteNonce] = useState(0);
  /** Промокод, подтверждённый ответом quote (applied === true). */
  const [promoConfirmed, setPromoConfirmed] = useState("");
  const [promoHint, setPromoHint] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [formError, setFormError] = useState("");
  const [policyConsent, setPolicyConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const timeSectionRef = useRef<HTMLElement | null>(null);
  const scrollToTimeAfterDateRef = useRef(false);

  const checkoutReady = Boolean(date && time);
  /** Пока quote не подтвердил промо — не пускаем в оплату (иначе bePaid получит полную сумму). */
  const promoCheckoutBlocked =
    quotePending ||
    (Boolean(promoForQuote.trim()) &&
      normalizePromoCode(promoForQuote) !== normalizePromoCode(promoConfirmed));

  const summaryLine = useMemo(() => {
    if (count < 1) return null;
    if (quoteTotalLabel.startsWith("Не удалось")) return null;
    const tickets = `${count} ${ticketsWord(count)}`;
    const sum = quotePending || quoteTotalCents == null ? "…" : quoteTotalLabel;
    const when = date && time ? `${formatDateKeyRu(date)}, ${time}` : "";
    return when ? `${tickets} · ${when} · ${sum}` : `${tickets} на сумму ${sum}`;
  }, [count, quotePending, quoteTotalCents, quoteTotalLabel, date, time]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const query = readQuerySelection();
        const r = await fetch(
          `/api/public/calendar?${PUBLIC_API_HIDE_PAST}&kind=${encodeURIComponent(DOM_ROZHDESTVA_SLOT_KIND)}`,
        );
        const j = await readResponseJson<CalendarResponse>(r);
        if (!r.ok) throw new Error(j.hint || j.error || "calendar");
        if (cancelled) return;

        const days = j.days || {};
        if (Object.keys(days).length === 0) {
          setLoadError(j.hint || "Пока нет доступных дат.");
          return;
        }
        setMonthGroups(groupDays(days));

        if (query && query.count > 0) setCount(query.count);
        if (query?.date && days[query.date]?.bookable) {
          setDate(query.date);
          if (query.time) setTime(query.time);
          return;
        }
        const firstBookable = sortDateKeysAsc(
          Object.entries(days)
            .filter(([, row]) => row.bookable)
            .map(([dk]) => dk),
        )[0];
        if (firstBookable) setDate(firstBookable);
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Не удалось загрузить календарь.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTimesForDate = useCallback(async (dateKey: string) => {
    setTimesLoading(true);
    try {
      const r = await fetch(
        `/api/public/day-slots?${PUBLIC_API_HIDE_PAST}&kind=${encodeURIComponent(DOM_ROZHDESTVA_SLOT_KIND)}&date=${encodeURIComponent(dateKey)}`,
      );
      const j = await readResponseJson<DaySlotsResponse>(r);
      if (!r.ok) throw new Error(j.hint || j.error || "day-slots");
      const list = Array.isArray(j.times) ? j.times : [];
      setTimes(list);
      let missingRequested = false;
      setTime((prev) => {
        if (!prev) return list[0] ?? "";
        if (list.includes(prev)) return prev;
        missingRequested = true;
        return "";
      });
      if (missingRequested) {
        setFormError("Это время недоступно. Выберите другое.");
      }
    } catch {
      setTimes([]);
      setTime("");
    } finally {
      setTimesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!date) return;
    void loadTimesForDate(date);
  }, [date, loadTimesForDate]);

  useEffect(() => {
    if (!date || !scrollToTimeAfterDateRef.current || timesLoading) return;
    scrollToTimeAfterDateRef.current = false;
    const el = timeSectionRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [date, timesLoading]);

  useEffect(() => {
    if (!date || !time) return;
    let cancelled = false;

    setQuotePending(true);
    const base =
      `/api/public/order-quote?kind=${encodeURIComponent(DOM_ROZHDESTVA_SLOT_KIND)}` +
      `&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;

    const promoQ = promoForQuote.trim();
    const promoSuffix = promoQ ? `&promoCode=${encodeURIComponent(promoQ)}` : "";

    const fetchQuote = async (n: number) => {
      const r = await fetch(`${base}&adult=${n}&child=0&concession=0${promoSuffix}`);
      const body = await readResponseJson<QuoteResponse>(r);
      return { ok: r.ok, body };
    };

    Promise.all([fetchQuote(1), fetchQuote(count)])
      .then(([unit, total]) => {
        if (cancelled) return;
        setQuotePending(false);

        setUnitLabel(
          unit.ok && typeof unit.body.totalCents === "number" ?
            formatMoneyCents(unit.body.totalCents, unit.body.currency || "BYN")
          : "—",
        );

        if (
          !total.ok ||
          typeof total.body.formattedTotal !== "string" ||
          typeof total.body.totalCents !== "number"
        ) {
          setQuoteTotalLabel(total.body.hint || total.body.error || "Не удалось посчитать сумму");
          setQuoteTotalCents(null);
          if (total.body.promo?.hint) setPromoHint(total.body.promo.hint);
          return;
        }
        setQuoteTotalLabel(total.body.formattedTotal);
        setQuoteTotalCents(total.body.totalCents);
        if (total.body.promo?.applied === false && promoQ) {
          setPromoHint(total.body.promo.hint || "Промокод не применён");
          setPromoForQuote("");
          setPromoConfirmed("");
        } else if (total.body.promo?.applied === true) {
          setPromoHint(total.body.promo.hint || "");
          setPromoConfirmed(promoQ);
          if (typeof total.body.promo.amountCents === "number") {
            setQuoteTotalCents(total.body.promo.amountCents);
            if (typeof total.body.promo.formattedAmount === "string") {
              setQuoteTotalLabel(total.body.promo.formattedAmount);
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
  }, [date, time, count, promoForQuote, promoQuoteNonce]);

  function onSelectDate(dateKey: string, bookable: boolean) {
    if (!bookable) return;
    scrollToTimeAfterDateRef.current = true;
    setDate(dateKey);
    setFormError("");
  }

  function applyPromo() {
    const code = promoInput.trim();
    setPromoHint("");
    setPromoConfirmed("");
    if (!code) {
      setPromoForQuote("");
    } else {
      setPromoForQuote(code);
    }
    setPromoQuoteNonce((n) => n + 1);
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date || !time) {
      setFormError("Выберите дату и время сеанса.");
      return;
    }
    if (count < 1) {
      setFormError("Укажите количество билетов.");
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
          slotKind: DOM_ROZHDESTVA_SLOT_KIND,
          adult: count,
          child: 0,
          concession: 0,
          name: name.trim(),
          email: email.trim(),
          phone: toE164Phone(phoneCountryIso, phoneLocal),
          ...(promoConfirmed ? { promoCode: promoConfirmed } : {}),
          date,
          time,
        }),
      });
      const body = await readResponseJson<{
        redirectUrl?: string;
        hint?: string;
        error?: string;
      }>(r);
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
          <h1 className="sv2-head__title">Купить билеты на «Дом Рождества 2026»</h1>
        </header>

        <PaymentRetryNotice className="nom-plain-msg" />

        {loading ? <p className="nom-plain-msg nom-plain-msg--muted">Загрузка…</p> : null}
        {!loading && loadError ? <p className="nom-plain-msg">{loadError}</p> : null}

        {!loading && !loadError ? (
          <form
            id="sv2-checkout-form"
            className="nom-form-block nom-tilda-form t-form"
            onSubmit={(ev) => void onSubmit(ev)}
          >
            <section className="nom-block" aria-labelledby="sv2-date-label">
              <p id="sv2-date-label" className="nom-block-label">
                Выберите дату
              </p>
              <div className="sv2-months">
                {monthGroups.map((month) => (
                  <div key={month.key} className="sv2-month sv2-month--open">
                    <p className="sv2-month__title">{month.title}</p>
                    <div className="sv2-days" role="group" aria-label={month.title}>
                      {month.days.map((d) => (
                        <button
                          key={d.dateKey}
                          type="button"
                          className={[
                            "sv2-day",
                            date === d.dateKey ? "sv2-day--selected" : "",
                            d.bookable ? "" : "sv2-day--disabled",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          disabled={!d.bookable || busy}
                          title={d.bookable ? undefined : d.hover || "Недоступно"}
                          aria-pressed={date === d.dateKey}
                          onClick={() => onSelectDate(d.dateKey, d.bookable)}
                        >
                          <span className="sv2-day__num">{String(d.day).padStart(2, "0")}</span>
                          <span className="sv2-day__wd" aria-hidden>
                            {weekdayShortRu(d.dateKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {date ? (
              <section ref={timeSectionRef} className="nom-block" aria-labelledby="sv2-time-label">
                <p id="sv2-time-label" className="nom-block-label">
                  Выберите время
                </p>
                {timesLoading ? (
                  <p className="nom-plain-msg nom-plain-msg--muted">Загрузка времени…</p>
                ) : times.length === 0 ? (
                  <p className="nom-plain-msg nom-plain-msg--muted">На этот день нет сеансов.</p>
                ) : (
                  <div className="sv2-times" role="group" aria-label="Время сеанса">
                    {times.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={["sv2-time", time === t ? "sv2-time--selected" : ""]
                          .filter(Boolean)
                          .join(" ")}
                        aria-pressed={time === t}
                        disabled={busy}
                        onClick={() => {
                          setTime(t);
                          setFormError("");
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}

            {checkoutReady ? (
              <section className="nom-block" aria-labelledby="sv2-tickets-label">
                <p id="sv2-tickets-label" className="nom-block-label">
                  Билеты
                </p>
                <div className="nom-ticket-row">
                  <div className="nom-ticket-text">
                    <div className="nom-ticket-line">Единый {unitLabel}</div>
                    <p className="sv2-ticket-hint">для взрослых и детей</p>
                  </div>
                  <div className="nom-qty">
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Меньше билетов"
                      disabled={count <= 0 || busy}
                      onClick={() => setCount((n) => Math.max(0, n - 1))}
                    >
                      −
                    </button>
                    <span className="nom-qty-ring">{count}</span>
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Больше билетов"
                      disabled={busy}
                      onClick={() => setCount((n) => Math.min(MAX_TICKETS, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {checkoutReady ? (
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
            ) : null}

            {summaryLine ? (
              <p className="nom-summary" aria-busy={quotePending}>
                <strong>{summaryLine}</strong>
              </p>
            ) : checkoutReady && count < 1 ? (
              <p className="nom-plain-msg nom-plain-msg--muted">Укажите количество билетов</p>
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
              disabled={busy || !checkoutReady || count < 1 || !policyConsent || promoCheckoutBlocked}
              className="t-submit nom-submit"
            >
              {busy ? "Оформляем…" : "Перейти к оплате"}
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
