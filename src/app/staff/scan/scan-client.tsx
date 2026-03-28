"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseTicketToken } from "@/lib/parse-qr-token";

function formatCameraError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lower = msg.toLowerCase();
  if (lower.includes("permission") || lower.includes("notallowed")) {
    return `${msg} Разрешите доступ к камере в настройках браузера для этого сайта.`;
  }
  if (!window.isSecureContext) {
    return `${msg} На http://IP браузеры часто блокируют камеру. Используйте https (команда npm run dev:lan:https на сервере) или вставьте ссылку из QR вручную ниже.`;
  }
  return msg;
}

export function ScanClient() {
  const router = useRouter();
  const [auth, setAuth] = useState<"unknown" | "yes" | "no">("unknown");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** false = localhost/https; true = типичный http://192.168.x.x — камера часто запрещена */
  const [insecureContext, setInsecureContext] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const regionId = "qr-reader-region";

  useEffect(() => {
    setInsecureContext(typeof window !== "undefined" && !window.isSecureContext);
  }, []);

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

  const stopScanner = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
      } catch {
        /* ignore */
      }
      try {
        await s.clear();
      } catch {
        /* ignore */
      }
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, [stopScanner]);

  const onDecoded = useCallback(
    async (text: string) => {
      await stopScanner();
      const token = parseTicketToken(text);
      router.push(`/staff/quick?t=${encodeURIComponent(token)}`);
    },
    [router, stopScanner],
  );

  const startScanner = useCallback(async () => {
    setError(null);
    await stopScanner();
    const el = document.getElementById(regionId);
    if (!el) {
      setError("Нет контейнера камеры");
      return;
    }
    const scanner = new Html5Qrcode(regionId);
    scannerRef.current = scanner;
    setScanning(true);
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => {
          void onDecoded(decoded);
        },
        () => {
          /* ignore frame errors */
        },
      );
    } catch (e) {
      setScanning(false);
      scannerRef.current = null;
      setError(formatCameraError(e));
    }
  }, [onDecoded, stopScanner]);

  if (auth === "unknown") {
    return <p className="text-sm text-zinc-600">Проверка сессии…</p>;
  }
  if (auth === "no") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700">
        <p>Нужна авторизация.</p>
        <a
          className="mt-2 inline-block font-medium text-zinc-900 underline"
          href="/staff/login?next=/staff/scan"
        >
          Войти
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {insecureContext ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-medium">Камера на этом адресе часто не работает</p>
          <p className="mt-1 text-amber-900">
            Открыто по <strong>http://</strong> и IP в Wi‑Fi — Chrome и Safari считают это небезопасным контекстом и{" "}
            <strong>блокируют getUserMedia</strong> (камеру). Исключения: <strong>localhost</strong> и{" "}
            <strong>https</strong>.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-amber-900">
            <li>
              Тест камеры на компьютере:{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">http://127.0.0.1:ПОРТ/staff/scan</code>
            </li>
            <li>
              С телефона: на Mac выполните{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">npm run dev:lan:https</code>, откройте{" "}
              <code className="rounded bg-amber-100 px-1 text-xs">https://ВАШ_IP:ПОРТ</code> и примите
              самоподписанный сертификат
            </li>
            <li>Без камеры: вставьте ссылку или токен из QR в блок ниже</li>
          </ul>
        </div>
      ) : null}
      <div id={regionId} className="aspect-square w-full overflow-hidden rounded-xl bg-black/90" />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {!scanning ? (
          <button
            type="button"
            onClick={() => void startScanner()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
          >
            Включить камеру
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void stopScanner()}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900"
          >
            Остановить
          </button>
        )}
      </div>
      <ManualTokenForm />
    </div>
  );
}

function ManualTokenForm() {
  const router = useRouter();
  const [raw, setRaw] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = parseTicketToken(raw);
    if (token.length < 8) return;
    router.push(`/staff/quick?t=${encodeURIComponent(token)}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <span className="font-medium text-zinc-800">Или вставьте данные из QR</span>
      <textarea
        className="min-h-[72px] rounded-lg border border-zinc-200 bg-white px-2 py-1 font-mono text-sm text-zinc-900 placeholder:text-zinc-500"
        placeholder="Ссылка или токен"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
      />
      <button type="submit" className="w-fit rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white">
        Проверить
      </button>
    </form>
  );
}
