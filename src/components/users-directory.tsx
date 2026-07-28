"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

const ADMIN_SECRET_STORAGE_KEY = "dei_admin_ui_secret";

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  createdAt: string;
  ordersCount: number;
};

type CustomersResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  customers: CustomerRow[];
};

function readStoredAdminSecret(): string {
  try {
    return localStorage.getItem(ADMIN_SECRET_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function writeStoredAdminSecret(secret: string) {
  try {
    localStorage.setItem(ADMIN_SECRET_STORAGE_KEY, secret);
  } catch {
    /* ignore */
  }
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const msg =
      json && typeof json === "object" && json !== null && "message" in json ?
        String((json as { message?: string }).message)
      : text || r.statusText;
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return json as T;
}

const PAGE_SIZE = 20;

export function UsersDirectory() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/session", { credentials: "include" });
        if (!cancelled) setAuthed(r.ok);
      } catch {
        if (!cancelled) setAuthed(false);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authChecked && !authed) setSecretInput(readStoredAdminSecret());
  }, [authChecked, authed]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (q.trim()) params.set("q", q.trim());
      const res = await adminFetch<CustomersResponse>(`/api/admin/customers?${params}`);
      setData(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, q]);

  useEffect(() => {
    if (!authed) return;
    void load();
  }, [authed, load]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoginErr("");
    const secret = secretInput.trim();
    if (!secret) {
      setLoginErr("Введите секрет");
      return;
    }
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { message?: string } | null;
        setLoginErr(body?.message || "Неверный секрет");
        return;
      }
      writeStoredAdminSecret(secret);
      setAuthed(true);
    } catch {
      setLoginErr("Ошибка сети");
    }
  }

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  if (!authChecked) {
    return (
      <div className="users-page">
        <div className="users-shell users-shell--narrow">
          <p className="users-muted">Проверка доступа…</p>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="users-page">
        <div className="users-shell users-shell--narrow">
          <h1 className="users-title">Пользователи</h1>
          <p className="users-lead">Войдите тем же секретом, что и в админке билетов.</p>
          <form className="users-login" onSubmit={(e) => void onLogin(e)}>
            {loginErr ? <p className="users-error">{loginErr}</p> : null}
            <label className="users-field">
              <span>Секрет</span>
              <input
                type="password"
                autoComplete="current-password"
                value={secretInput}
                onChange={(e) => setSecretInput(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="users-btn">
              Войти
            </button>
          </form>
          <p className="users-foot">
            <Link href="/">← На главную</Link>
          </p>
        </div>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const rows = data?.customers ?? [];

  return (
    <div className="users-page">
      <div className="users-shell">
        <header className="users-head">
          <div>
            <h1 className="users-title">Пользователи</h1>
            <p className="users-lead">
              Все записи из базы покупателей · новые сверху
              {data ? ` · всего ${total}` : ""}
            </p>
          </div>
          <div className="users-head-actions">
            <Link href="/anketa" className="users-btn users-btn--ghost">
              Анкета
            </Link>
            <Link href="/admin" className="users-btn users-btn--ghost">
              Админка
            </Link>
            <Link href="/" className="users-btn users-btn--ghost">
              Главная
            </Link>
          </div>
        </header>

        <form className="users-search" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Поиск: имя, телефон или email"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            aria-label="Поиск пользователей"
          />
          <button type="submit" className="users-btn" disabled={loading}>
            Найти
          </button>
          {q ? (
            <button
              type="button"
              className="users-btn users-btn--ghost"
              onClick={() => {
                setQInput("");
                setQ("");
                setPage(1);
              }}
            >
              Сбросить
            </button>
          ) : null}
        </form>

        {err ? <p className="users-error">{err}</p> : null}

        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Имя</th>
                <th>Телефон</th>
                <th>Email</th>
                <th>Заказов</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="users-empty">
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="users-empty">
                    {q ? "Никого не найдено по запросу" : "Пока нет пользователей"}
                  </td>
                </tr>
              ) : null}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="users-mono">{c.createdAt}</td>
                  <td>{c.name}</td>
                  <td className="users-mono">{c.phone}</td>
                  <td>{c.email}</td>
                  <td className="users-num">{c.ordersCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="users-pager">
          <button
            type="button"
            className="users-btn users-btn--ghost"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ← Назад
          </button>
          <span className="users-muted">
            Стр. {page} из {totalPages}
            {loading ? " · обновление…" : ""}
          </span>
          <button
            type="button"
            className="users-btn users-btn--ghost"
            disabled={loading || page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд →
          </button>
        </div>
      </div>
    </div>
  );
}
