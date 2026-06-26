"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { GardensSchemePanzoom } from "@/components/gardens-scheme-panzoom";
import { GardensSeatMap } from "@/components/gardens-seat-map";
import { PhoneCountryField } from "@/components/phone-country-field";
import { PolicyConsentField } from "@/components/policy-consent-field";
import type { GardensSeat } from "@/lib/gardens-of-dreams/seat-map";
import {
  GARDENS_MOCK_SESSION,
  getGardensMockSeatMapResponse,
  isGardensMockEnabled,
} from "@/lib/gardens-of-dreams/mock-demo";
import { formatGardensPerformanceDateLabel } from "@/lib/gardens-of-dreams/schedule";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { readResponseJson } from "@/lib/read-response-json";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";

const GARDENS_PHONE_COUNTRIES = ["by", "ru"] as const;

type GardensSession = {
  slotId: string;
  date: string;
  time: string;
  title: string;
  entryTime?: string;
  showDurationMinutes?: number;
  freeSeats: number;
  bookable: boolean;
};

type GardensSessionsResponse = {
  timezone: string;
  sessions: GardensSession[];
  error?: string;
  hint?: string;
};

type SeatMapResponse = {
  slotId: string;
  title: string;
  currency: string;
  seats: GardensSeat[];
  occupied: string[];
  error?: string;
  hint?: string;
};

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency.length === 3 ? currency : "BYN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}

function applySessionToState(
  s: GardensSession,
  setters: {
    setSession: (v: GardensSession) => void;
    setDate: (v: string) => void;
    setTime: (v: string) => void;
    setEntryTime: (v: string) => void;
    setShowDurationMinutes: (v: number | undefined) => void;
  },
) {
  setters.setSession(s);
  setters.setDate(s.date);
  setters.setTime(s.time);
  setters.setEntryTime(s.entryTime ?? "");
  setters.setShowDurationMinutes(s.showDurationMinutes);
}

export default function SadySnovideniyPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isMock, setIsMock] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [entryTime, setEntryTime] = useState("");
  const [showDurationMinutes, setShowDurationMinutes] = useState<number | undefined>();
  const [session, setSession] = useState<GardensSession | null>(null);
  const [slotId, setSlotId] = useState("");
  const [sessionTitle, setSessionTitle] = useState("");
  const [currency, setCurrency] = useState("BYN");

  const [seats, setSeats] = useState<GardensSeat[]>([]);
  const [occupiedKeys, setOccupiedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [policyConsent, setPolicyConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const occupied = useMemo(() => new Set(occupiedKeys), [occupiedKeys]);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const selectedSeats = useMemo(
    () => seats.filter((s) => selected.has(s.key)),
    [seats, selected],
  );

  const totalCents = useMemo(
    () => selectedSeats.reduce((sum, s) => sum + s.priceCents, 0),
    [selectedSeats],
  );

  const sessionSetters = useMemo(
    () => ({
      setSession,
      setDate,
      setTime,
      setEntryTime,
      setShowDurationMinutes,
    }),
    [],
  );

  const applyMockSession = useCallback(
    (s: GardensSession) => {
      const mock = getGardensMockSeatMapResponse(s);
      applySessionToState(s, sessionSetters);
      setSlotId(mock.slotId);
      setSessionTitle(mock.title);
      setCurrency(mock.currency);
      setSeats(mock.seats);
      setOccupiedKeys(mock.occupied);
      setSelectedKeys((prev) => prev.filter((k) => !mock.occupied.includes(k)));
    },
    [sessionSetters],
  );

  const loadSeatMap = useCallback(
    async (s: GardensSession) => {
      if (isMock) {
        applyMockSession(s);
        return;
      }
      const r = await fetch(`/api/public/seat-map?slotId=${encodeURIComponent(s.slotId)}`);
      const body = await readResponseJson<SeatMapResponse>(r);
      if (!r.ok) {
        throw new Error(body.hint || body.error || `seat-map ${r.status}`);
      }
      applySessionToState(s, sessionSetters);
      setSlotId(body.slotId);
      setSessionTitle(body.title);
      setCurrency(body.currency || "BYN");
      setSeats(body.seats);
      setOccupiedKeys(body.occupied);
      setSelectedKeys((prev) => prev.filter((k) => !body.occupied.includes(k)));
    },
    [applyMockSession, isMock, sessionSetters],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");

      const mock = isGardensMockEnabled();
      if (!cancelled) setIsMock(mock);

      if (mock) {
        if (!cancelled) {
          applyMockSession(GARDENS_MOCK_SESSION);
          setLoading(false);
        }
        return;
      }

      try {
        const r = await fetch("/api/public/gardens-sessions");
        const body = await readResponseJson<GardensSessionsResponse>(r);
        if (!r.ok) throw new Error(body.hint || body.error || "gardens-sessions");

        const show = body.sessions.find((s) => s.bookable) ?? body.sessions[0];
        if (!show) {
          throw new Error("Сеанс не найден в расписании.");
        }

        if (!cancelled) {
          await loadSeatMap(show);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMockSession, loadSeatMap]);

  function toggleSeat(key: string) {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setFormError("");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isMock) {
      setFormError("Тестовый режим: оплата временно отключена.");
      return;
    }
    if (selectedKeys.length === 0) {
      setFormError("Выберите места на схеме.");
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
          slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
          slotId,
          seats: selectedKeys,
          name: name.trim(),
          email: email.trim(),
          phone: toE164Phone(phoneCountryIso, phoneLocal),
        }),
      });
      const body = await readResponseJson<{
        redirectUrl?: string;
        hint?: string;
        error?: string;
      }>(r);
      if (!r.ok || !body.redirectUrl) {
        setFormError(body.hint || body.error || `Ошибка (${r.status})`);
        if (r.status === 409 && session) {
          await loadSeatMap(session);
          setSelectedKeys([]);
        }
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
    <main className="god-page">
      <header className="god-head">
        <p className="god-head__kicker">Иммерсивная танцевальная мистерия</p>
        <h1 className="god-head__title">Сады сновидений</h1>
        {date ? (
          <>
            <p className="god-head__session">{formatGardensPerformanceDateLabel(date)}</p>
            {entryTime && time ? (
              <ul className="god-head__schedule">
                <li>{entryTime} — вход на выставку</li>
                <li>
                  {time} — шоу
                  {showDurationMinutes ? ` (${showDurationMinutes} минут)` : ""}
                </li>
              </ul>
            ) : null}
          </>
        ) : null}
      </header>

      {loading ? <p className="god-msg">Загрузка…</p> : null}
      {!loading && loadError ? <p className="god-msg god-msg--error">{loadError}</p> : null}

      {!loading && !loadError ? (
        <>
          {isMock ? (
            <p className="god-demo-banner" role="status">
              Слоты и занятость — тестовые данные. Оплата отключена до деплоя.
              Боевой API: <code>?mock=0</code>
            </p>
          ) : null}

          <div className="god-map-scroll">
            <GardensSchemePanzoom>
              <GardensSeatMap
                seats={seats}
                occupied={occupied}
                selected={selected}
                onToggle={toggleSeat}
                disabled={busy}
              />
            </GardensSchemePanzoom>
          </div>

          <div className="god-checkout">
            <section className="god-panel" aria-labelledby="god-selected-label">
              <h2 id="god-selected-label">Выбранные места</h2>
              {selectedSeats.length === 0 ? (
                <p className="god-msg">Нажмите на место на схеме — 1 место = 1 билет</p>
              ) : (
                <ul className="god-selected-list">
                  {selectedSeats.map((s) => (
                    <li key={s.key}>
                      <span>{s.label}</span>
                      <span>{formatMoney(s.priceCents, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="god-total">
                Итого: {selectedSeats.length ? formatMoney(totalCents, currency) : "—"}
              </p>
            </section>

            <section className="god-panel">
              <h2>Контакты и оплата</h2>
              <form className="god-form" onSubmit={(ev) => void onSubmit(ev)}>
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
                        countryIsos={GARDENS_PHONE_COUNTRIES}
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

                {formError ? <p className="god-plain-msg">{formError}</p> : null}

                <button
                  type="submit"
                  className="god-submit"
                  disabled={busy || selectedSeats.length === 0 || !policyConsent}
                >
                  {isMock ? "Оплата скоро" : busy ? "Оформляем…" : "Перейти к оплате"}
                </button>
              </form>
              {sessionTitle ? (
                <p className="god-head__session god-head__session--muted">{sessionTitle}</p>
              ) : null}
            </section>
          </div>
        </>
      ) : null}
    </main>
  );
}
