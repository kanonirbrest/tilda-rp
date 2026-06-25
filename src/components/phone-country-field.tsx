"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  PHONE_COUNTRIES,
  formatLocalPhone,
  getPhoneCountry,
  type PhoneCountry,
} from "@/lib/phone-countries";

type PhoneCountryFieldProps = {
  countryIso: string;
  localValue: string;
  onCountryChange: (iso: string) => void;
  onLocalChange: (value: string) => void;
  disabled?: boolean;
  /** Ограничить список стран, например ["by", "ru"]. */
  countryIsos?: readonly string[];
};

export function PhoneCountryField({
  countryIso,
  localValue,
  onCountryChange,
  onLocalChange,
  disabled = false,
  countryIsos,
}: PhoneCountryFieldProps) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const countries = useMemo(() => {
    if (!countryIsos?.length) return PHONE_COUNTRIES;
    const allowed = new Set(countryIsos.map((iso) => iso.toLowerCase()));
    return PHONE_COUNTRIES.filter((item) => allowed.has(item.iso));
  }, [countryIsos]);

  const country = useMemo(() => {
    const match = countries.find((item) => item.iso === countryIso.toLowerCase());
    return match ?? getPhoneCountry(countryIso);
  }, [countries, countryIso]);

  useEffect(() => {
    if (!countryIsos?.length) return;
    const allowed = new Set(countryIsos.map((iso) => iso.toLowerCase()));
    if (!allowed.has(countryIso.toLowerCase()) && countries[0]) {
      onCountryChange(countries[0].iso);
    }
  }, [countries, countryIso, countryIsos, onCountryChange]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(ev: MouseEvent | TouchEvent) {
      const el = wrapRef.current;
      if (!el || (ev.target instanceof Node && el.contains(ev.target))) return;
      setOpen(false);
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointer);
    document.addEventListener("touchstart", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointer);
      document.removeEventListener("touchstart", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickCountry(next: PhoneCountry) {
    onCountryChange(next.iso);
    onLocalChange(formatLocalPhone(localValue, next));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="t-input t-input-phonemask__wrap">
      <button
        type="button"
        className="t-input-phonemask__select"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-label={`Код страны: ${country.name}`}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="t-input-phonemask__select-flag" data-phonemask-flag={country.iso} />
        <span className="t-input-phonemask__select-triangle" aria-hidden />
        <span className="t-input-phonemask__select-code">+{country.dialCode}</span>
      </button>

      <input
        required
        type="tel"
        name="phoneLocal"
        autoComplete="tel-national"
        aria-label="Телефон"
        placeholder={country.placeholder}
        className="t-input t-input-phonemask"
        inputMode="numeric"
        value={localValue}
        disabled={disabled}
        onChange={(e) => onLocalChange(formatLocalPhone(e.target.value, country))}
      />

      <div
        id={listId}
        role="listbox"
        aria-label="Выбор кода страны"
        className={`t-input-phonemask__options-wrap${open ? " t-input-phonemask__options-wrap_open" : ""}`}
      >
        {countries.map((item) => {
          const chosen = item.iso === country.iso;
          return (
            <button
              key={item.iso}
              type="button"
              role="option"
              aria-selected={chosen}
              className={`t-input-phonemask__options-item${chosen ? " t-input-phonemask__options-item_chosen" : ""}`}
              onClick={() => pickCountry(item)}
            >
              <span>{item.name}</span>
              <span className="t-input-phonemask__options-right">
                <span className="t-input-phonemask__options-code">+{item.dialCode}</span>
                <span
                  className={`t-input-phonemask__options-flag t-input-phonemask__options-flag_${item.iso}`}
                  data-phonemask-flag={item.iso}
                  aria-hidden
                />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
