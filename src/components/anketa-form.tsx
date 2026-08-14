"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { PhoneCountryField } from "@/components/phone-country-field";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";
import { birthDateToYmd, formatBirthDateRuInput } from "@/lib/birth-date";
import { DEI_POLICY_URL } from "@/lib/policy-consent";

const PHONE_COUNTRIES = ["by", "ru"] as const;

const ANKETA_POLICY_CONSENT_ERROR =
  "Нужно дать согласие на обработку персональных данных";

export function AnketaForm() {
  const [firstName, setFirstName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [policyConsent, setPolicyConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const fn = firstName.trim();
    const bd = birthDate.trim();
    const birthDateYmd = birthDateToYmd(bd);
    const em = email.trim();
    if (!fn) {
      setError("Укажите имя");
      return;
    }
    if (!birthDateYmd) {
      setError(bd ? "Некорректная дата рождения (ДД.ММ.ГГГГ)" : "Укажите дату рождения");
      return;
    }
    if (!em || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError("Укажите корректный email");
      return;
    }
    if (!isPhoneComplete(phoneCountryIso, phoneLocal)) {
      setError("Укажите полный номер телефона");
      return;
    }
    if (!policyConsent) {
      setError(ANKETA_POLICY_CONSENT_ERROR);
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/public/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          firstName: fn,
          birthDate: birthDateYmd,
          email: em,
          phone: toE164Phone(phoneCountryIso, phoneLocal),
          policyConsent: true,
        }),
      });
      const body = (await r.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        hint?: string;
        error?: string;
      } | null;
      if (!r.ok) {
        setError(body?.message || body?.hint || body?.error || `Ошибка ${r.status}`);
        return;
      }
      setDone(true);
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="anketa-success" role="status">
        <span className="anketa-success__icon" aria-hidden>✓</span>
        <p className="anketa-success__title">Спасибо!</p>
        <p className="anketa-success__text">Данные сохранены. Мы свяжемся с вами при необходимости.</p>
        <button
          type="button"
          className="anketa-btn anketa-btn--ghost"
          onClick={() => {
            setDone(false);
            setFirstName("");
            setBirthDate("");
            setEmail("");
            setPhoneLocal("");
            setPolicyConsent(false);
          }}
        >
          Отправить ещё раз
        </button>
      </div>
    );
  }

  return (
    <form className="anketa-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <div className="anketa-grid">
        <label className="anketa-field">
          <span>Имя</span>
          <input
            name="firstName"
            autoComplete="given-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            disabled={busy}
            required
          />
        </label>
        <label className="anketa-field">
          <span>Дата рождения</span>
          <input
            name="birthDate"
            type="text"
            inputMode="numeric"
            autoComplete="bday"
            placeholder="ДД.ММ.ГГГГ"
            value={birthDate}
            onChange={(e) => setBirthDate(formatBirthDateRuInput(e.target.value))}
            disabled={busy}
            required
            maxLength={10}
          />
        </label>
      </div>

      <label className="anketa-field">
        <span>Телефон</span>
        <PhoneCountryField
          countryIso={phoneCountryIso}
          localValue={phoneLocal}
          onCountryChange={setPhoneCountryIso}
          onLocalChange={setPhoneLocal}
          disabled={busy}
          countryIsos={PHONE_COUNTRIES}
        />
      </label>

      <label className="anketa-field">
        <span>Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          required
        />
      </label>

      <label className="anketa-consent" htmlFor="anketa-policy-consent">
        <input
          id="anketa-policy-consent"
          type="checkbox"
          name="policyConsent"
          checked={policyConsent}
          onChange={(e) => setPolicyConsent(e.target.checked)}
          disabled={busy}
          required
        />
        <span className="anketa-consent__text">
          Я даю согласие ООО &quot;РАЗМАН ПРОДАКШН&quot;, на обработку предоставленных мной
          персональных данных, включая имя, дату рождения, контактные данные.
          С политикой обработки персональных данных ознакомлен(а):{" "}
          <a href={DEI_POLICY_URL} target="_blank" rel="noopener noreferrer">
            {DEI_POLICY_URL}
          </a>
        </span>
      </label>

      {error ? <p className="anketa-error">{error}</p> : null}

      <button type="submit" className="anketa-btn" disabled={busy}>
        <span>{busy ? "Отправка…" : "Отправить"}</span>
        {!busy ? <span className="anketa-btn__icon" aria-hidden>→</span> : null}
      </button>

      <p className="anketa-footnote">
        <Link href="/">На главную</Link>
      </p>
    </form>
  );
}
