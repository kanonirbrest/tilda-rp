"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PolicyConsentField } from "@/components/policy-consent-field";
import { readResponseJson } from "@/lib/read-response-json";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { normalizePromoCode } from "@/lib/promo-code";
import { NEBO_REKA_SLOT_KIND } from "@/lib/slot-kind";

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
  /** В БД есть хотя бы один сеанс на этот календарный день */
  hasSlots: boolean;
};

type MonthGroup = {
  key: string;
  title: string;
  days: CalendarDayCell[];
};

const WEEKDAY_SHORT_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"] as const;

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

function isSummerMonth(dateKey: string): boolean {
  const m = Number(dateKey.split("-")[1]);
  return m >= 6 && m <= 8;
}

function sortDateKeysAsc(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** 0=вс … 6=сб по календарной дате YYYY-MM-DD (без сдвига TZ). */
function calendarWeekdayUtc(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return -1;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
}

function isMondayOrTuesday(dateKey: string): boolean {
  const wd = calendarWeekdayUtc(dateKey);
  return wd === 1 || wd === 2;
}

/** пн–вс по календарной дате YYYY-MM-DD (без сдвига TZ). */
function weekdayShortRu(dateKey: string): string {
  const wd = calendarWeekdayUtc(dateKey);
  return wd >= 0 ? (WEEKDAY_SHORT_RU[wd] ?? "") : "";
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

const SUMMER_MONTHS = [6, 7, 8] as const;

/** Не показывать прошедшие сеансы сегодня и прошлые дни (как на /buy-tickets-summer). */
const PUBLIC_API_HIDE_PAST = "hidePastTimes=1";

function daysInCalendarMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function summerYearsFromCalendar(
  days: Record<string, { bookable: boolean; hover: string }>,
): number[] {
  const years = new Set<number>();
  for (const dateKey of Object.keys(days)) {
    if (!isSummerMonth(dateKey)) continue;
    const y = Number(dateKey.split("-")[0]);
    if (Number.isFinite(y)) years.add(y);
  }
  return sortDateKeysAsc([...years].map(String)).map((s) => Number(s));
}

function buildMonthDayCells(
  year: number,
  month: number,
  days: Record<string, { bookable: boolean; hover: string }>,
): CalendarDayCell[] {
  const last = daysInCalendarMonth(year, month);
  const cells: CalendarDayCell[] = [];
  for (let d = 1; d <= last; d++) {
    const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const row = days[dateKey];
    if (isMondayOrTuesday(dateKey) && !row) continue;
    if (row) {
      cells.push({
        dateKey,
        day: d,
        bookable: row.bookable,
        hover: row.hover,
        hasSlots: true,
      });
    } else {
      cells.push({
        dateKey,
        day: d,
        bookable: false,
        hover: "На этот день сеансов нет",
        hasSlots: false,
      });
    }
  }
  return cells;
}

/** Июнь–август: все дни месяца; пн/вт без слотов в БД скрыты; остальные — как раньше */
function groupSummerDays(
  days: Record<string, { bookable: boolean; hover: string }>,
): MonthGroup[] {
  const years = summerYearsFromCalendar(days);
  const groups: MonthGroup[] = [];

  for (const year of years) {
    for (const month of SUMMER_MONTHS) {
      const monthKey = `${year}-${String(month).padStart(2, "0")}`;
      groups.push({
        key: monthKey,
        title: `${MONTH_NOMINATIVE[month] ?? ""} ${year}`,
        days: buildMonthDayCells(year, month, days),
      });
    }
  }

  return groups;
}

const DEFAULT_EXHIBITION_TZ = "Europe/Minsk";

/** YYYY-MM в часовом поясе витрины */
function wallMonthKeyNow(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  return `${y}-${m}`;
}

function defaultExpandedMonthKeys(groups: MonthGroup[], timeZone: string): Set<string> {
  if (groups.length === 0) return new Set();
  const nowKey = wallMonthKeyNow(timeZone);
  if (groups.some((g) => g.key === nowKey)) return new Set([nowKey]);
  const next = groups.find((g) => g.key >= nowKey);
  return new Set([next?.key ?? groups[0]!.key]);
}

export default function BuyTicketsSmrPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [calendarDays, setCalendarDays] = useState<Record<string, { bookable: boolean; hover: string }>>(
    {},
  );
  const [calendarTimezone, setCalendarTimezone] = useState(DEFAULT_EXHIBITION_TZ);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const expandedMonthsInitRef = useRef(false);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [timesLoading, setTimesLoading] = useState(false);

  const [adult, setAdult] = useState(0);
  const [child, setChild] = useState(0);
  const [concession, setConcession] = useState(0);

  const [quoteTotalLabel, setQuoteTotalLabel] = useState("—");
  const [quoteTotalCents, setQuoteTotalCents] = useState<number | null>(null);
  const [quoteCurrency, setQuoteCurrency] = useState("BYN");
  const [quotePending, setQuotePending] = useState(false);

  const [unitAdult, setUnitAdult] = useState("—");
  const [unitChild, setUnitChild] = useState("—");
  const [unitConcession, setUnitConcession] = useState("—");

  const [promoInput, setPromoInput] = useState("");
  /** Код, переданный в order-quote после «Применить». */
  const [promoForQuote, setPromoForQuote] = useState("");
  /** Промокод, подтверждённый ответом quote (applied === true). */
  const [promoConfirmed, setPromoConfirmed] = useState("");
  const [promoHint, setPromoHint] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState("");
  const [policyConsent, setPolicyConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const timeSectionRef = useRef<HTMLElement | null>(null);
  const scrollToTimeAfterDateRef = useRef(false);

  const monthGroups = useMemo(() => groupSummerDays(calendarDays), [calendarDays]);
  const ticketCount = adult + child + concession;

  useEffect(() => {
    if (expandedMonthsInitRef.current || monthGroups.length === 0) return;
    setExpandedMonths(defaultExpandedMonthKeys(monthGroups, calendarTimezone));
    expandedMonthsInitRef.current = true;
  }, [monthGroups, calendarTimezone]);

  const loadCalendar = useCallback(async () => {
    const calRes = await fetch(
      `/api/public/calendar?${PUBLIC_API_HIDE_PAST}&kind=${encodeURIComponent(NEBO_REKA_SLOT_KIND)}`,
    );
    const calJson = await readResponseJson<CalendarResponse>(calRes);
    if (!calRes.ok) {
      throw new Error(calJson.hint || calJson.error || "calendar");
    }
    if (calJson.timezone) setCalendarTimezone(calJson.timezone);
    setCalendarDays(calJson.days || {});
    return calJson.days || {};
  }, []);

  function toggleMonthExpanded(monthKey: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) next.delete(monthKey);
      else next.add(monthKey);
      return next;
    });
  }

  const loadTimesForDate = useCallback(async (dateKey: string) => {
    setTimesLoading(true);
    try {
      const r = await fetch(
        `/api/public/day-slots?${PUBLIC_API_HIDE_PAST}&kind=${encodeURIComponent(NEBO_REKA_SLOT_KIND)}&date=${encodeURIComponent(dateKey)}`,
      );
      const j = await readResponseJson<DaySlotsResponse>(r);
      if (!r.ok) throw new Error(j.hint || j.error || "day-slots");
      const list = Array.isArray(j.times) ? j.times : [];
      setTimes(list);
      setTime((prev) => (list.includes(prev) ? prev : list[0] ?? ""));
    } catch {
      setTimes([]);
      setTime("");
    } finally {
      setTimesLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const days = await loadCalendar();
        const firstBookable = sortDateKeysAsc(
          Object.entries(days)
            .filter(([dk, row]) => isSummerMonth(dk) && row.bookable)
            .map(([dk]) => dk),
        )[0];
        if (!firstBookable) {
          throw new Error("На летний сезон пока нет доступных дат.");
        }
        if (!cancelled) {
          setDate(firstBookable);
          await loadTimesForDate(firstBookable);
        }
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
  }, [loadCalendar, loadTimesForDate]);

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
    let cancelled = false;
    if (!date || !time) return;

    setQuotePending(true);
    const base =
      `/api/public/order-quote?kind=${encodeURIComponent(NEBO_REKA_SLOT_KIND)}` +
      `&date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`;

    const promoQ = promoForQuote.trim();
    const promoSuffix = promoQ ? `&promoCode=${encodeURIComponent(promoQ)}` : "";

    const fetchQuote = async (a: number, c: number, co: number) => {
      const r = await fetch(`${base}&adult=${a}&child=${c}&concession=${co}${promoSuffix}`);
      const body = await readResponseJson<QuoteResponse>(r);
      return { ok: r.ok, body };
    };

    Promise.all([
      fetchQuote(1, 0, 0),
      fetchQuote(0, 1, 0),
      fetchQuote(0, 0, 1),
      fetchQuote(adult, child, concession),
    ])
      .then(([qa, qc, qo, qt]) => {
        if (cancelled) return;
        setQuotePending(false);

        const unitFrom = (res: { ok: boolean; body: QuoteResponse }) => {
          if (!res.ok || typeof res.body.totalCents !== "number") return "—";
          return formatMoneyCents(res.body.totalCents, res.body.currency || "BYN");
        };
        setUnitAdult(unitFrom(qa));
        setUnitChild(unitFrom(qc));
        setUnitConcession(unitFrom(qo));

        if (
          !qt.ok ||
          typeof qt.body.formattedTotal !== "string" ||
          typeof qt.body.totalCents !== "number"
        ) {
          setQuoteTotalLabel(qt.body.hint || qt.body.error || "Не удалось посчитать сумму");
          setQuoteTotalCents(null);
          if (qt.body.promo?.hint) setPromoHint(qt.body.promo.hint);
          return;
        }
        setQuoteTotalLabel(qt.body.formattedTotal);
        setQuoteTotalCents(qt.body.totalCents);
        setQuoteCurrency(qt.body.currency || "BYN");
        if (qt.body.promo?.applied === false && promoQ) {
          setPromoHint(qt.body.promo.hint || "Промокод не применён");
          setPromoForQuote("");
          setPromoConfirmed("");
        } else if (qt.body.promo?.applied === true) {
          setPromoHint(qt.body.promo.hint || "");
          setPromoConfirmed(promoQ);
          if (typeof qt.body.promo.amountCents === "number") {
            setQuoteTotalCents(qt.body.promo.amountCents);
            if (typeof qt.body.promo.formattedAmount === "string") {
              setQuoteTotalLabel(qt.body.promo.formattedAmount);
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
  }, [date, time, adult, child, concession, promoForQuote]);

  const summaryLine = useMemo(() => {
    if (ticketCount < 1) return null;
    if (quoteTotalLabel.startsWith("Не удалось")) return null;
    if (quotePending || quoteTotalCents == null) {
      return `${ticketCount} ${ticketsWord(ticketCount)} на сумму …`;
    }
    return `${ticketCount} ${ticketsWord(ticketCount)} на сумму ${quoteTotalLabel}`;
  }, [ticketCount, quotePending, quoteTotalCents, quoteTotalLabel]);

  function onSelectDate(dateKey: string, bookable: boolean, hasSlots: boolean) {
    if (!hasSlots || !bookable) return;
    scrollToTimeAfterDateRef.current = true;
    setDate(dateKey);
    setFormError("");
  }

  function applyPromo() {
    const code = promoInput.trim();
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
    if (ticketCount < 1) {
      setFormError("Укажите количество билетов.");
      return;
    }
    if (!policyConsent) {
      setFormError(DEI_POLICY_CONSENT_ERROR);
      return;
    }
    setFormError("");
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotKind: NEBO_REKA_SLOT_KIND,
          date,
          time,
          adult,
          child,
          concession,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          ...(promoConfirmed ? { promoCode: promoConfirmed } : {}),
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
          <h1 className="sv2-head__title">{"Купить билеты на\u00A0выставку Небо.Река"}</h1>
        </header>

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
                {monthGroups.map((month) => {
                  const monthOpen = expandedMonths.has(month.key);
                  const monthToggleId = `sv2-month-${month.key}`;
                  const monthPanelId = `sv2-month-panel-${month.key}`;
                  return (
                  <div
                    key={month.key}
                    className={["sv2-month", monthOpen ? "sv2-month--open" : "sv2-month--collapsed"]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <button
                      type="button"
                      className="sv2-month__toggle"
                      id={monthToggleId}
                      aria-expanded={monthOpen}
                      aria-controls={monthPanelId}
                      disabled={busy}
                      onClick={() => toggleMonthExpanded(month.key)}
                    >
                      <span className="sv2-month__title">{month.title}</span>
                      <span className="sv2-month__chevron" aria-hidden />
                    </button>
                    {monthOpen ? (
                    <div
                      id={monthPanelId}
                      className="sv2-days"
                      role="group"
                      aria-label={month.title}
                      aria-labelledby={monthToggleId}
                    >
                      {month.days.map((d) => (
                        <button
                          key={d.dateKey}
                          type="button"
                          className={[
                            "sv2-day",
                            date === d.dateKey ? "sv2-day--selected" : "",
                            !d.hasSlots ? "sv2-day--no-slots" : "",
                            d.hasSlots && !d.bookable ? "sv2-day--disabled" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          disabled={!d.hasSlots || !d.bookable || busy}
                          title={
                            !d.hasSlots
                              ? d.hover
                              : !d.bookable
                                ? d.hover || "Недоступно"
                                : undefined
                          }
                          aria-pressed={date === d.dateKey}
                          onClick={() => onSelectDate(d.dateKey, d.bookable, d.hasSlots)}
                        >
                          <span className="sv2-day__num">{String(d.day).padStart(2, "0")}</span>
                          <span className="sv2-day__wd" aria-hidden>
                            {weekdayShortRu(d.dateKey)}
                          </span>
                        </button>
                      ))}
                    </div>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </section>

            {date ? (
              <section
                ref={timeSectionRef}
                className="nom-block"
                aria-labelledby="sv2-time-label"
              >
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

            {date && time ? (
              <section className="nom-block" aria-labelledby="sv2-tickets-label">
                <p id="sv2-tickets-label" className="nom-block-label">
                  Билеты
                </p>

                <div className="nom-ticket-row">
                  <div className="nom-ticket-text">
                    <div className="nom-ticket-line">Взрослый {unitAdult}</div>
                    <p className="sv2-ticket-hint">с 12 лет</p>
                  </div>
                  <div className="nom-qty">
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Меньше взрослых"
                      disabled={adult <= 0 || busy}
                      onClick={() => setAdult((n) => Math.max(0, n - 1))}
                    >
                      −
                    </button>
                    <span className="nom-qty-ring">{adult}</span>
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Больше взрослых"
                      disabled={busy}
                      onClick={() => setAdult((n) => Math.min(30, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="nom-ticket-row">
                  <div className="nom-ticket-text">
                    <div className="nom-ticket-line">Детский {unitChild}</div>
                    <p className="sv2-ticket-hint">с 3 до 12 лет</p>
                  </div>
                  <div className="nom-qty">
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Меньше детских"
                      disabled={child <= 0 || busy}
                      onClick={() => setChild((n) => Math.max(0, n - 1))}
                    >
                      −
                    </button>
                    <span className="nom-qty-ring">{child}</span>
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Больше детских"
                      disabled={busy}
                      onClick={() => setChild((n) => Math.min(30, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="nom-ticket-row">
                  <div className="nom-ticket-text">
                    <div className="nom-ticket-line">Льготный {unitConcession}</div>
                    <p className="sv2-ticket-hint">пенсионеры, инвалиды</p>
                  </div>
                  <div className="nom-qty">
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Меньше льготных"
                      disabled={concession <= 0 || busy}
                      onClick={() => setConcession((n) => Math.max(0, n - 1))}
                    >
                      −
                    </button>
                    <span className="nom-qty-ring">{concession}</span>
                    <button
                      type="button"
                      className="nom-qty-btn"
                      aria-label="Больше льготных"
                      disabled={busy}
                      onClick={() => setConcession((n) => Math.min(30, n + 1))}
                    >
                      +
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {date && time ? (
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
            ) : date && time && ticketCount < 1 ? (
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
                  <div className="t-input t-input-phonemask__wrap">
                    <div className="t-input-phonemask__select" aria-hidden>
                      <span className="t-input-phonemask__select-flag" data-phonemask-flag="by" />
                      <span className="t-input-phonemask__select-triangle" />
                      <span
                        className="t-input-phonemask__select-code"
                        style={{ fontSize: 16, fontWeight: 200 }}
                      >
                        +375
                      </span>
                    </div>
                    <input
                      required
                      type="tel"
                      name="phoneLocal"
                      autoComplete="tel"
                      aria-label="Телефон"
                      placeholder="(00) 000-00-00"
                      className="t-input t-input-phonemask"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={busy}
                    />
                  </div>
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
              disabled={busy || !date || !time || ticketCount < 1 || !policyConsent}
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
