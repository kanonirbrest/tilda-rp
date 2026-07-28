"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { PhoneCountryField } from "@/components/phone-country-field";
import { isPhoneComplete, toE164Phone } from "@/lib/phone-countries";

const PHONE_COUNTRIES = ["by", "ru"] as const;

export function AnketaForm() {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [phoneCountryIso, setPhoneCountryIso] = useState("by");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const ln = lastName.trim();
    const fn = firstName.trim();
    const em = email.trim();
    if (!ln || !fn) {
      setError("Укажите фамилию и имя");
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

    setBusy(true);
    try {
      const r = await fetch("/api/public/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          lastName: ln,
          firstName: fn,
          email: em,
          phone: toE164Phone(phoneCountryIso, phoneLocal),
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
        <p className="anketa-success__title">Спасибо!</p>
        <p className="anketa-success__text">Данные сохранены. Мы свяжемся с вами при необходимости.</p>
        <button
          type="button"
          className="anketa-btn anketa-btn--ghost"
          onClick={() => {
            setDone(false);
            setLastName("");
            setFirstName("");
            setEmail("");
            setPhoneLocal("");
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
          <span>Фамилия</span>
          <input
            name="lastName"
            autoComplete="family-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            disabled={busy}
            required
          />
        </label>
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

      {error ? <p className="anketa-error">{error}</p> : null}

      <button type="submit" className="anketa-btn" disabled={busy}>
        {busy ? "Отправка…" : "Отправить"}
      </button>

      <p className="anketa-footnote">
        <Link href="/">← На главную</Link>
      </p>
    </form>
  );
}
