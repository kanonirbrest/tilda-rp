"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PhoneCountryField } from "@/components/phone-country-field";
import { PolicyConsentField } from "@/components/policy-consent-field";
import { VivaldiSeatMap } from "@/components/vivaldi-seat-map";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { normalizePromoCode } from "@/lib/promo-code";
import { readResponseJson } from "@/lib/read-response-json";
import { formatGardensCheckoutError } from "@/lib/seat-checkout-errors";
import { VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";
import { vivaldiVolumeDiscountCents, vivaldiVolumeDiscountHint } from "@/lib/vivaldi/pricing";
import { formatVivaldiPerformanceDateLabel } from "@/lib/vivaldi/schedule";
import type { VivaldiSeat } from "@/lib/vivaldi/seat-map";

const PHONE_COUNTRIES = ["by", "ru"] as const;

type VivaldiSession = {
  slotId: string;
  date: string;
  time: string;
  title: string;
  freeSeats: number;
  bookable: boolean;
};

type SessionResponse = {
  timezone: string;
  session: VivaldiSession | null;
  error?: string;
  hint?: string;
};

type SeatMapResponse = {
  slotId: string;
  title: string;
  currency: string;
  seats: VivaldiSeat[];
  occupied: string[];
  error?: string;
  hint?: string;
};

type SeatQuoteResponse = {
  subtotalCents: number;
  totalCents: number;
  volumeDiscountCents?: number;
  volumeDiscountHint?: string;
  currency: string;
  promo?: {
    applied: boolean;
    discountCents?: number;
    hint?: string;
    error?: string;
  };
  error?: string;
  hint?: string;
};

type VivaldiTicketsPageProps = {
  initialSeats: VivaldiSeat[];
  date: string;
  time: string;
  title: string;
  /** Скидка 10% от 3 билетов. На 26 октября выключена. */
  volumeDiscount?: boolean;
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

export function VivaldiTicketsPage({
  initialSeats,
  date: initialDate,
  time: initialTime,
  title: initialTitle,
  volumeDiscount = false,
}: VivaldiTicketsPageProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(initialTime);
  const [session, setSession] = useState<VivaldiSession | null>(null);
  const [slotId, setSlotId] = useState("");
  const [sessionTitle, setSessionTitle] = useState(initialTitle);
  const [currency, setCurrency] = useState("BYN");
  const [seats, setSeats] = useState<VivaldiSeat[]>(initialSeats);
  const [occupiedKeys, setOccupiedKeys] = useState<string[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [policyConsent, setPolicyConsent] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoForQuote, setPromoForQuote] = useState("");
  const [promoConfirmed, setPromoConfirmed] = useState("");
  const [promoHint, setPromoHint] = useState("");
  const [quotePending, setQuotePending] = useState(false);
  const [quoteTotalCents, setQuoteTotalCents] = useState<number | null>(null);
  const [quoteDiscountCents, setQuoteDiscountCents] = useState(0);

  const occupied = useMemo(() => new Set(occupiedKeys), [occupiedKeys]);
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedSeats = useMemo(() => seats.filter((s) => selected.has(s.key)), [seats, selected]);
  const totalCents = useMemo(
    () => selectedSeats.reduce((sum, s) => sum + s.priceCents, 0),
    [selectedSeats],
  );
  const localVolumeCents = volumeDiscount
    ? vivaldiVolumeDiscountCents(selectedSeats.length, totalCents)
    : 0;
  const discountCents = quoteTotalCents != null ? quoteDiscountCents : localVolumeCents;
  const payableCents =
    quoteTotalCents != null ? quoteTotalCents : totalCents - localVolumeCents;
  const volumeHint = volumeDiscount ? vivaldiVolumeDiscountHint(selectedSeats.length) : null;

  const loadSeatMap = useCallback(async (s: VivaldiSession) => {
    const r = await fetch(`/api/public/seat-map?slotId=${encodeURIComponent(s.slotId)}`);
    const body = await readResponseJson<SeatMapResponse>(r);
    if (!r.ok) throw new Error(body.hint || body.error || `seat-map ${r.status}`);
    setSession(s);
    setDate(s.date);
    setTime(s.time);
    setSlotId(body.slotId);
    setSessionTitle(body.title);
    setCurrency(body.currency || "BYN");
    const byKey = new Map(initialSeats.map((seat) => [seat.key, seat]));
    setSeats(
      body.seats.map((seat) => {
        const geo = byKey.get(seat.key);
        return geo
          ? {
              ...seat,
              ...geo,
              priceCents: geo.priceCents,
              selectable: geo.selectable,
              availability: geo.availability,
            }
          : seat;
      }),
    );
    setOccupiedKeys(body.occupied);
    setSelectedKeys((prev) => prev.filter((k) => !body.occupied.includes(k)));
  }, [initialSeats]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const r = await fetch(
          `/api/public/vivaldi-session?date=${encodeURIComponent(initialDate)}`,
        );
        const body = await readResponseJson<SessionResponse>(r);
        if (!r.ok) throw new Error(body.hint || body.error || "vivaldi-session");
        if (!body.session) throw new Error("Сеанс не найден.");
        if (!cancelled) await loadSeatMap(body.session);
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : "";
          const apiMissing = raw.includes("404") || raw.includes("API не найден");
          setLoadError(
            apiMissing
              ? "Продажа ещё не подключена на этом сервере. Схему можно посмотреть, оплата заработает после деплоя."
              : raw || "Не удалось загрузить занятость мест.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDate, loadSeatMap]);

  useEffect(() => {
    if (!slotId || selectedKeys.length === 0) {
      setQuotePending(false);
      setQuoteTotalCents(null);
      setQuoteDiscountCents(0);
      if (!promoForQuote) {
        setPromoConfirmed("");
        setPromoHint("");
      }
      return;
    }

    let cancelled = false;
    const promoQ = promoForQuote.trim();
    (async () => {
      setQuotePending(true);
      try {
        const url =
          `/api/public/seat-order-quote?slotId=${encodeURIComponent(slotId)}` +
          `&seats=${encodeURIComponent(selectedKeys.join(","))}` +
          (promoQ ? `&promoCode=${encodeURIComponent(promoQ)}` : "");
        const r = await fetch(url);
        const body = await readResponseJson<SeatQuoteResponse>(r);
        if (cancelled) return;
        if (!r.ok) {
          const localVolume = volumeDiscount
            ? vivaldiVolumeDiscountCents(selectedKeys.length, totalCents)
            : 0;
          setQuoteTotalCents(totalCents - localVolume);
          setQuoteDiscountCents(localVolume);
          if (promoQ) {
            setPromoHint(body.hint || body.error || "Промокод не применён");
            setPromoForQuote("");
            setPromoConfirmed("");
          }
          return;
        }
        setQuoteTotalCents(body.totalCents);
        const volume = body.volumeDiscountCents ?? 0;
        if (body.promo?.applied === false && promoQ) {
          setPromoHint(body.promo.hint || "Промокод не применён");
          setPromoForQuote("");
          setPromoConfirmed("");
          setQuoteDiscountCents(volume);
        } else if (body.promo?.applied === true) {
          setPromoHint(body.promo.hint || "Промокод применён");
          setPromoConfirmed(promoQ);
          setQuoteDiscountCents(Math.max(0, body.subtotalCents - body.totalCents));
        } else {
          setQuoteDiscountCents(volume);
          if (!promoQ) {
            setPromoConfirmed("");
            setPromoHint(body.volumeDiscountHint || "");
          }
        }
      } catch {
        if (!cancelled) {
          setQuoteTotalCents(totalCents);
          setQuoteDiscountCents(0);
        }
      } finally {
        if (!cancelled) setQuotePending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slotId, selectedKeys, promoForQuote, totalCents, volumeDiscount]);

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

  function toggleSeat(key: string) {
    if (selectedKeys.includes(key)) {
      setSelectedKeys((prev) => prev.filter((k) => k !== key));
      setFormError("");
      return;
    }
    if (selectedKeys.length >= 24) {
      setFormError("За один заказ можно выбрать не больше 24 мест.");
      return;
    }
    setSelectedKeys((prev) => [...prev, key]);
    setFormError("");
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;
    if (selectedKeys.length === 0) {
      setFormError("Выберите места на схеме.");
      return;
    }
    if (!session?.bookable) {
      setFormError("Продажа на этот сеанс закрыта.");
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
    submittingRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slotKind: VIVALDI_CONCERT_SLOT_KIND,
          slotId,
          seats: selectedKeys,
          name: name.trim(),
          email: email.trim(),
          phone: toE164Phone(phoneCountryIso, phoneLocal),
          ...(promoConfirmed ? { promoCode: promoConfirmed } : {}),
        }),
      });
      const body = await readResponseJson<{
        redirectUrl?: string;
        hint?: string;
        message?: string;
        error?: string;
      }>(r);
      if (!r.ok || !body.redirectUrl) {
        setFormError(formatGardensCheckoutError(body, r.status));
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
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="god-page">
      <header className="god-head">
        <p className="god-head__kicker">Антонио Вивальди</p>
        <h1 className="god-head__title">Времена года</h1>
        {date ? (
          <p className="god-head__session">
            {formatVivaldiPerformanceDateLabel(date)}
            {time ? `, ${time}` : ""}
          </p>
        ) : null}
      </header>

      {loading ? <p className="god-msg">Загрузка занятости мест…</p> : null}
      {!loading && loadError ? <p className="god-msg god-msg--error">{loadError}</p> : null}

      {seats.length > 0 ? (
        <>
          <div className="vv-map-scroll">
            <VivaldiSeatMap
              seats={seats}
              occupied={occupied}
              selected={selected}
              onToggle={toggleSeat}
              disabled={busy || session?.bookable === false}
            />
          </div>
          <p className="vv-legend">
            <span><i className="vv-swatch-free" /> Свободно</span>
            <span><i className="vv-swatch-pick" /> Выбрано</span>
            <span><i className="vv-swatch-sold" /> Занято</span>
            <span><i className="vv-swatch-off" /> Недоступно</span>
            {volumeDiscount ? <span>От 3 билетов — скидка 10%</span> : null}
          </p>

          <div className="god-checkout">
            <section className="god-panel" aria-labelledby="vv-selected-label">
              <h2 id="vv-selected-label">Выбранные места</h2>
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
              {volumeHint ? <p className="god-discount">{volumeHint}</p> : null}
              {discountCents > 0 ? (
                <p className="god-discount">Скидка: −{formatMoney(discountCents, currency)}</p>
              ) : null}
              <p className="god-total" aria-busy={quotePending}>
                Итого:{" "}
                {selectedSeats.length
                  ? quotePending
                    ? "…"
                    : formatMoney(payableCents, currency)
                  : "—"}
              </p>
            </section>

            <section className="god-panel" aria-labelledby="vv-promo-label">
              <h2 id="vv-promo-label">Промокод</h2>
              <div className="god-promo-row">
                <input
                  type="text"
                  className="god-promo-input"
                  placeholder="Промокод"
                  maxLength={64}
                  autoComplete="off"
                  value={promoInput}
                  onChange={(e) => onPromoInputChange(e.target.value)}
                  disabled={busy || selectedSeats.length === 0}
                />
                <button
                  type="button"
                  className="god-promo-apply"
                  disabled={busy || !promoInput.trim() || selectedSeats.length === 0}
                  onClick={applyPromo}
                >
                  Применить
                </button>
              </div>
              {promoHint ? <p className="god-promo-hint">{promoHint}</p> : null}
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
                        countryIsos={PHONE_COUNTRIES}
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

                {formError ? <p className="god-plain-msg">{formError}</p> : null}

                <button
                  type="submit"
                  className="god-submit"
                  disabled={
                    busy ||
                    loading ||
                    !session?.bookable ||
                    selectedSeats.length === 0 ||
                    !policyConsent ||
                    promoCheckoutBlocked
                  }
                >
                  {busy ? "Оформляем…" : "Перейти к оплате"}
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
