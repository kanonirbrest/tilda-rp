"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { PhoneCountryField } from "@/components/phone-country-field";
import { MarketingConsentField } from "@/components/marketing-consent-field";
import { PolicyConsentField } from "@/components/policy-consent-field";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";
import { readResponseJson } from "@/lib/read-response-json";
import { formatDateKeyRu } from "@/lib/exhibition-time";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { formatPrintTicketToken } from "@/lib/print-ticket-token";

type CalendarResponse = {
  days: Record<string, { bookable: boolean; hover: string }>;
  error?: string;
  hint?: string;
};

type DaySlotsResponse = { times: string[]; error?: string; hint?: string };

type TicketView = {
  status: "unregistered" | "registered" | "used";
  serialLabel: string;
  displayCode: string;
  tierLabel: string;
  qrDataUrl?: string;
  reservation: {
    dateLabel: string;
    timeKey: string;
    customerName: string;
    email: string;
  } | null;
  error?: string;
  hint?: string;
};

type CalendarDayCell = {
  dateKey: string;
  day: number;
  bookable: boolean;
  hover: string;
  hasSlots: boolean;
};

type MonthGroup = {
  key: string;
  title: string;
  cells: Array<CalendarDayCell | null>;
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
const CALENDAR_WEEKDAY_HEADERS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

function sortDateKeysAsc(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function calendarWeekdayUtc(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function mondayIndex(dateKey: string): number {
  return (calendarWeekdayUtc(dateKey) + 6) % 7;
}

function weekdayShortRu(dateKey: string): string {
  return WEEKDAY_SHORT_RU[calendarWeekdayUtc(dateKey)] ?? "";
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + deltaDays));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

function groupDays(days: Record<string, { bookable: boolean; hover: string }>): MonthGroup[] {
  const byMonth = new Map<string, string[]>();
  for (const dateKey of sortDateKeysAsc(Object.keys(days))) {
    const monthKey = dateKey.slice(0, 7);
    const list = byMonth.get(monthKey) ?? [];
    list.push(dateKey);
    byMonth.set(monthKey, list);
  }

  return [...byMonth.entries()].map(([key, dateKeys]) => {
    const first = dateKeys[0]!;
    const last = dateKeys[dateKeys.length - 1]!;
    const start = shiftDateKey(first, -mondayIndex(first));
    const end = shiftDateKey(last, 6 - mondayIndex(last));
    const cells: Array<CalendarDayCell | null> = [];

    for (let cursor = start; cursor <= end; cursor = shiftDateKey(cursor, 1)) {
      if (cursor.slice(0, 7) !== key) {
        cells.push(null);
        continue;
      }
      const row = days[cursor];
      cells.push({
        dateKey: cursor,
        day: Number(cursor.slice(8, 10)),
        bookable: row?.bookable ?? false,
        hover: row?.hover || (row ? "Недоступно" : "На этот день сеансов нет"),
        hasSlots: Boolean(row),
      });
    }

    return {
      key,
      title: `${MONTH_NOMINATIVE[Number(key.slice(5, 7))] ?? ""} ${key.slice(0, 4)}`,
      cells,
    };
  });
}

function TicketQr({ view }: { view: TicketView }) {
  return (
    <div className="nom-block" style={{ textAlign: "center" }}>
      {view.qrDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={view.qrDataUrl}
          alt="QR билета"
          width={220}
          height={220}
          style={{ margin: "0 auto", background: "#fff", padding: 8, borderRadius: 8 }}
        />
      ) : null}
      <p className="nom-plain-msg">
        {view.tierLabel} билет
        <br />
        Уникальный код билета: <strong>{view.displayCode}</strong>
        <br />
        № {view.serialLabel}
      </p>
    </div>
  );
}

export function DomRozhdestvaRegister({ initialToken }: { initialToken: string }) {
  const [tokenInput, setTokenInput] = useState(
    initialToken ? formatPrintTicketToken(initialToken) : "",
  );
  const [token, setToken] = useState(initialToken.trim());
  const [view, setView] = useState<TicketView | null>(null);
  const [ticketError, setTicketError] = useState("");
  const [ticketLoading, setTicketLoading] = useState(Boolean(initialToken.trim()));

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [monthGroups, setMonthGroups] = useState<MonthGroup[]>([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [times, setTimes] = useState<string[]>([]);
  const [timesLoading, setTimesLoading] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [formError, setFormError] = useState("");
  const [policyConsent, setPolicyConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const timeSectionRef = useRef<HTMLElement | null>(null);

  const loadTicket = useCallback(async (raw: string) => {
    const t = raw.trim();
    if (t.length < 8) {
      setTicketError("Введите уникальный код билета.");
      setView(null);
      return;
    }
    setTicketLoading(true);
    setTicketError("");
    try {
      const r = await fetch(`/api/public/print-tickets?t=${encodeURIComponent(t)}`);
      const j = await readResponseJson<TicketView>(r);
      if (!r.ok) {
        setView(null);
        setTicketError(j.hint || j.error || "Билет не найден.");
        return;
      }
      setView(j);
      setToken(t);
    } catch {
      setView(null);
      setTicketError("Не удалось проверить билет. Попробуйте ещё раз.");
    } finally {
      setTicketLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialToken.trim()) void loadTicket(initialToken);
  }, [initialToken, loadTicket]);

  useEffect(() => {
    if (!view || view.status !== "unregistered") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const r = await fetch("/api/public/print-tickets/calendar");
        const j = await readResponseJson<CalendarResponse>(r);
        if (!r.ok) throw new Error(j.hint || j.error || "calendar");
        if (cancelled) return;
        const days = j.days || {};
        if (Object.keys(days).length === 0) {
          setLoadError("Пока нет доступных дат для регистрации.");
          return;
        }
        setMonthGroups(groupDays(days));
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
  }, [view]);

  const loadTimesForDate = useCallback(async (dateKey: string) => {
    setTimesLoading(true);
    try {
      const r = await fetch(
        `/api/public/print-tickets/day-slots?date=${encodeURIComponent(dateKey)}`,
      );
      const j = await readResponseJson<DaySlotsResponse>(r);
      if (!r.ok) throw new Error(j.hint || j.error || "day-slots");
      const list = Array.isArray(j.times) ? j.times : [];
      setTimes(list);
      setTime((prev) => (prev && list.includes(prev) ? prev : (list[0] ?? "")));
    } catch {
      setTimes([]);
      setTime("");
    } finally {
      setTimesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!date || view?.status !== "unregistered") return;
    void loadTimesForDate(date);
  }, [date, view?.status, loadTimesForDate]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!date || !time) {
      setFormError("Выберите дату и время сеанса.");
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
      const r = await fetch("/api/public/print-tickets/reserve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          date,
          time,
          name: name.trim(),
          email: email.trim(),
          phone: toE164Phone(phoneCountryIso, phoneLocal),
          policyConsent: true,
          ...(marketingConsent ? { marketingConsent: true } : {}),
        }),
      });
      const body = await readResponseJson<TicketView>(r);
      if (!r.ok) {
        setFormError(body.hint || body.error || `Ошибка (${r.status})`);
        if (body.error === "ALREADY_REGISTERED") await loadTicket(token);
        return;
      }
      setView(body);
    } catch {
      setFormError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const checkoutReady = Boolean(date && time);
  const showForm = view?.status === "unregistered";

  return (
    <main className="nom-page nom-page--dr">
      <div className="nom-page__bg" aria-hidden />
      <div className="nom-shell">
        <header className="nom-head">
          <h1 className="sv2-head__title">Регистрация билета «Дом Рождества 2026»</h1>
        </header>

        {!view ? (
          <form
            className="nom-form-block nom-tilda-form t-form"
            onSubmit={(ev) => {
              ev.preventDefault();
              void loadTicket(tokenInput);
            }}
          >
            <p className="nom-block-label">Уникальный код билета</p>
            <div className="t-form__inputsbox">
              <div className="t-input-group">
                <div className="t-input-block">
                  <input
                    type="text"
                    className="t-input"
                    placeholder="XXXXX-XXXXX"
                    autoComplete="off"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    disabled={ticketLoading}
                  />
                </div>
              </div>
            </div>
            {ticketError ? <p className="nom-plain-msg">{ticketError}</p> : null}
            <button type="submit" className="t-submit nom-submit" disabled={ticketLoading}>
              {ticketLoading ? "Проверяем…" : "Найти билет"}
            </button>
          </form>
        ) : null}

        {ticketLoading ? <p className="nom-plain-msg nom-plain-msg--muted">Загрузка…</p> : null}

        {view?.status === "registered" || view?.status === "used" ? (
          <>
            <p className="nom-plain-msg">
              {view.status === "used" ?
                "Этот билет уже использован на входе."
              : `Вы записаны на ${view.reservation?.dateLabel ?? ""}, ${view.reservation?.timeKey ?? ""}.`}
            </p>
            {view.reservation ? (
              <p className="nom-plain-msg nom-plain-msg--muted">
                {view.reservation.customerName} · {view.reservation.email}
              </p>
            ) : null}
            <TicketQr view={view} />
            <p className="nom-plain-msg nom-plain-msg--muted">
              Приходите с печатным билетом или покажите этот QR. Это тот же код.
            </p>
          </>
        ) : null}

        {showForm ? (
          <>
            <p className="nom-plain-msg nom-plain-msg--muted">
              {view.tierLabel} билет · {view.displayCode} · № {view.serialLabel}
            </p>
            {loading ? <p className="nom-plain-msg nom-plain-msg--muted">Загрузка…</p> : null}
            {!loading && loadError ? <p className="nom-plain-msg">{loadError}</p> : null}
            {!loading && !loadError ? (
              <form
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
                        <div className="sv2-cal">
                          <div className="sv2-weekdays" aria-hidden>
                            {CALENDAR_WEEKDAY_HEADERS.map((label) => (
                              <span key={label}>{label}</span>
                            ))}
                          </div>
                          <div className="sv2-days" role="group" aria-label={month.title}>
                            {month.cells.map((d, index) =>
                              d == null ? (
                                <span
                                  key={`${month.key}-pad-${index}`}
                                  className="sv2-day sv2-day--pad"
                                  aria-hidden
                                />
                              ) : (
                                <button
                                  key={d.dateKey}
                                  type="button"
                                  className={[
                                    "sv2-day",
                                    date === d.dateKey ? "sv2-day--selected" : "",
                                    d.hasSlots ? "" : "sv2-day--no-slots",
                                    d.hasSlots && !d.bookable ? "sv2-day--disabled" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  disabled={!d.hasSlots || !d.bookable || busy}
                                  title={d.bookable ? undefined : d.hover}
                                  aria-label={`${formatDateKeyRu(d.dateKey)}, ${weekdayShortRu(d.dateKey)}`}
                                  aria-pressed={date === d.dateKey}
                                  onClick={() => {
                                    if (!d.bookable) return;
                                    setDate(d.dateKey);
                                    setFormError("");
                                  }}
                                >
                                  <span className="sv2-day__num">{String(d.day).padStart(2, "0")}</span>
                                </button>
                              ),
                            )}
                          </div>
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
                  <p className="nom-summary">
                    <strong>
                      {formatDateKeyRu(date)}, {time}
                    </strong>
                  </p>
                ) : null}

                <div className="t-form__inputsbox">
                  <div className="t-input-group t-input-group_em">
                    <div className="t-input-block">
                      <input
                        required
                        type="email"
                        name="email"
                        autoComplete="email"
                        aria-label="Почта"
                        placeholder="Почта"
                        className="t-input js-tilda-rule"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={busy}
                      />
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
                <MarketingConsentField
                  checked={marketingConsent}
                  onChange={setMarketingConsent}
                  disabled={busy}
                />

                {formError ? <p className="nom-plain-msg">{formError}</p> : null}

                <button
                  type="submit"
                  disabled={busy || !checkoutReady || !policyConsent}
                  className="t-submit nom-submit"
                >
                  {busy ? "Резервируем…" : "Зарезервировать"}
                </button>
              </form>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
