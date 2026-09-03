"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { parseTicketToken } from "@/lib/parse-qr-token";

/** Защита от двойного скана подряд. */
const SCAN_DEBOUNCE_MS = 800;
/**
 * Сканеры часто шлют символы без Enter. После паузы в наборе считаем скан завершённым.
 * Wedge обычно печатает очень быстро (<50ms между символами).
 */
const IDLE_SUBMIT_MS = 180;

export function TerminalScanClient() {
  const router = useRouter();
  const [auth, setAuth] = useState<"unknown" | "yes" | "no">("unknown");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/staff/me");
      if (cancelled) return;
      if (res.ok) {
        const data = (await res.json()) as { authenticated?: boolean };
        setAuth(data.authenticated ? "yes" : "no");
      } else {
        setAuth("no");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goToTicket = useCallback(
    (raw: string) => {
      const token = parseTicketToken(raw);
      if (token.length < 8) {
        setError("Не удалось распознать код из QR");
        return;
      }
      setError(null);
      router.push(`/staff/quick?t=${encodeURIComponent(token)}&from=terminal`);
    },
    [router],
  );

  if (auth === "unknown") {
    return <p className="text-sm text-zinc-600">Проверка сессии…</p>;
  }
  if (auth === "no") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        <p>Нужна авторизация.</p>
        <a
          className="mt-2 inline-block font-medium text-zinc-900 underline"
          href="/staff/login?next=/staff/scan/terminal"
        >
          Войти
        </a>
      </div>
    );
  }

  return <HardwareWedgePanel onScan={goToTicket} error={error} />;
}

function HardwareWedgePanel({
  onScan,
  error,
}: {
  onScan: (raw: string) => void;
  error: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("Ожидание скана…");
  const [focused, setFocused] = useState(false);
  const lastScanAtRef = useRef(0);
  const navigatingRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const valueRef = useRef("");

  const focusInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, []);

  useEffect(() => {
    focusInput();
    const id = window.setInterval(() => {
      const el = inputRef.current;
      if (!el) return;
      if (document.activeElement !== el && !navigatingRef.current) {
        focusInput();
      }
    }, 700);
    const onVis = () => {
      if (document.visibilityState === "visible") focusInput();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    };
  }, [focusInput]);

  const acceptScan = useCallback(
    (raw: string) => {
      if (navigatingRef.current) return;
      const trimmed = raw.replace(/[\r\n]+/g, "").trim();
      if (trimmed.length < 8) {
        setStatus("Слишком короткий код — отсканируйте ещё раз");
        setValue("");
        valueRef.current = "";
        focusInput();
        return;
      }
      const now = Date.now();
      if (now - lastScanAtRef.current < SCAN_DEBOUNCE_MS) {
        setValue("");
        valueRef.current = "";
        focusInput();
        return;
      }
      lastScanAtRef.current = now;
      navigatingRef.current = true;
      if (idleTimerRef.current != null) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      setStatus("Открываем билет…");
      setValue("");
      valueRef.current = "";
      onScan(trimmed);
    },
    [focusInput, onScan],
  );

  function scheduleIdleSubmit(nextValue: string) {
    valueRef.current = nextValue;
    if (idleTimerRef.current != null) window.clearTimeout(idleTimerRef.current);
    if (nextValue.trim().length < 8) return;
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      acceptScan(valueRef.current);
    }, IDLE_SUBMIT_MS);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    acceptScan(value || e.currentTarget.value);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (idleTimerRef.current != null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    acceptScan(value);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          focused ?
            "rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4"
          : "rounded-xl border-2 border-amber-300 bg-amber-50 p-4"
        }
      >
        <p className="text-base font-semibold text-zinc-900">
          {focused ? "Готов к скану" : "Нажмите в поле ниже — нужен фокус"}
        </p>
        <p className="mt-1 text-sm text-zinc-700">
          Наведите сканер на QR и нажмите триггер. Страница сама откроет билет. Если код остался в
          поле — нажмите «Проверить».
        </p>
        <p className="mt-2 text-sm font-medium text-zinc-800">{status}</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-800" htmlFor="hardware-scan-input">
          Поле сканера
        </label>
        <input
          id="hardware-scan-input"
          ref={inputRef}
          type="text"
          inputMode="none"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setStatus(next.trim() ? "Скан получен…" : "Ожидание скана…");
            scheduleIdleSubmit(next);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            window.setTimeout(focusInput, 50);
          }}
          className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-4 font-mono text-base text-zinc-900 outline-none ring-emerald-500 focus:ring-2"
          placeholder="Скан попадёт сюда автоматически"
          aria-describedby="hardware-scan-hint"
        />
        <p id="hardware-scan-hint" className="text-xs text-zinc-500">
          После скана откроется карточка билета. Там кнопка «Клиент прошёл».
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={value.trim().length < 8}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Проверить
          </button>
          <button
            type="button"
            onClick={focusInput}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900"
          >
            Вернуть фокус
          </button>
        </div>
      </form>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
