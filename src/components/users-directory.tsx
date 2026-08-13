"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { formatMinorUnits } from "@/lib/money";

const ADMIN_SECRET_STORAGE_KEY = "dei_admin_ui_secret";

type CustomerSource = "anketa" | "tickets";

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthDate: string | null;
  createdAt: string;
  ordersCount: number;
  source: CustomerSource;
  fromBot: boolean;
};

type CustomersResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  customers: CustomerRow[];
  facets?: { titles: string[]; dates: string[] };
};

type CustomerOrder = {
  id: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  amountCents: number;
  discountCents: number;
  refundedCents: number;
  currency: string;
  promoCode: string | null;
  clubPromoTelegramUserId: string | null;
  fromBot: boolean;
  slot: {
    id: string;
    kind: string;
    title: string;
    startsAt: string;
  };
  lines: { tier: string | null; quantity: number; unitPriceCents: number }[];
  tickets: {
    id: string;
    tier: string | null;
    admissionCount: number;
    seatLabel: string | null;
    usedAt: string | null;
    refundedAt: string | null;
  }[];
};

type CustomerDetail = {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    birthDate: string | null;
    createdAt: string;
    ordersCount: number;
    source: CustomerSource;
    fromBot: boolean;
    botTelegramUserIds: string[];
  };
  orders: CustomerOrder[];
};

function formatBirthDateRu(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

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

function sourceLabel(source: CustomerSource, fromBot: boolean): string {
  if (source === "anketa") return "Анкета";
  if (fromBot) return "Билеты · бот";
  return "Билеты";
}

function statusLabel(status: string): string {
  switch (status.toUpperCase()) {
    case "PAID":
      return "Оплачен";
    case "PENDING":
      return "Ожидает";
    case "FAILED":
      return "Ошибка";
    case "CANCELLED":
      return "Отменён";
    case "REFUNDED":
      return "Возврат";
    default:
      return status;
  }
}

function formatDateKeyShort(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const PAGE_SIZE = 20;

export function UsersDirectory() {
  const detailTitleId = useId();
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [secretInput, setSecretInput] = useState("");
  const [loginErr, setLoginErr] = useState("");

  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState("");

  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [exportMsg, setExportMsg] = useState("");
  const [exportErr, setExportErr] = useState("");

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
      if (titleFilter.trim()) params.set("title", titleFilter.trim());
      if (dateFilter.trim()) params.set("date", dateFilter.trim());
      const res = await adminFetch<CustomersResponse>(`/api/admin/customers?${params}`);
      setData(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, q, titleFilter, dateFilter]);

  useEffect(() => {
    if (!authed) return;
    void load();
  }, [authed, load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailErr("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailErr("");
    (async () => {
      try {
        const res = await adminFetch<CustomerDetail>(`/api/admin/customers/${selectedId}`);
        if (!cancelled) setDetail(res);
      } catch (e: unknown) {
        if (!cancelled) {
          setDetail(null);
          setDetailErr(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

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

  function clearFilters() {
    setQInput("");
    setQ("");
    setTitleFilter("");
    setDateFilter("");
    setPage(1);
  }

  const hasFilters = Boolean(q || titleFilter || dateFilter);

  async function downloadExport(format: "csv" | "xlsx") {
    setExporting(format);
    setExportMsg("");
    setExportErr("");
    try {
      const r = await fetch(`/api/admin/customers/export?format=${format}`, {
        credentials: "include",
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t.slice(0, 400) || `HTTP ${r.status}`);
      }
      const blob = await r.blob();
      const cd = r.headers.get("Content-Disposition");
      let filename = `customers-export.${format}`;
      const m = /filename="([^"]+)"/.exec(cd ?? "");
      if (m?.[1]) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportMsg(format === "xlsx" ? "XLSX сохранён." : "CSV сохранён.");
    } catch (e: unknown) {
      setExportErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
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
  const panelOpen = selectedId != null;

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
            <button
              type="button"
              className="users-btn users-btn--ghost"
              disabled={exporting != null}
              onClick={() => void downloadExport("xlsx")}
            >
              {exporting === "xlsx" ? "XLSX…" : "XLSX"}
            </button>
            <button
              type="button"
              className="users-btn users-btn--ghost"
              disabled={exporting != null}
              onClick={() => void downloadExport("csv")}
            >
              {exporting === "csv" ? "CSV…" : "CSV"}
            </button>
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

        {exportErr ? <p className="users-error">{exportErr}</p> : null}
        {exportMsg ? <p className="users-ok">{exportMsg}</p> : null}

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
          {hasFilters ? (
            <button type="button" className="users-btn users-btn--ghost" onClick={clearFilters}>
              Сбросить
            </button>
          ) : null}
        </form>

        <div className="users-filters">
          <label className="users-filter">
            <span>Мероприятие</span>
            <select
              value={titleFilter}
              onChange={(e) => {
                setTitleFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Фильтр по названию мероприятия"
            >
              <option value="">Все мероприятия</option>
              {(data?.facets?.titles ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
              {titleFilter && !(data?.facets?.titles ?? []).includes(titleFilter) ? (
                <option value={titleFilter}>{titleFilter}</option>
              ) : null}
            </select>
          </label>
          <label className="users-filter">
            <span>Дата</span>
            <select
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Фильтр по дате мероприятия"
            >
              <option value="">Все даты</option>
              {(data?.facets?.dates ?? []).map((d) => (
                <option key={d} value={d}>
                  {formatDateKeyShort(d)}
                </option>
              ))}
              {dateFilter && !(data?.facets?.dates ?? []).includes(dateFilter) ? (
                <option value={dateFilter}>{formatDateKeyShort(dateFilter)}</option>
              ) : null}
            </select>
          </label>
        </div>

        {err ? <p className="users-error">{err}</p> : null}

        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Имя</th>
                <th>Дата рождения</th>
                <th>Телефон</th>
                <th>Email</th>
                <th>Откуда</th>
                <th>Заказов</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="users-empty">
                    Загрузка…
                  </td>
                </tr>
              ) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="users-empty">
                    {q ? "Никого не найдено по запросу" : "Пока нет пользователей"}
                  </td>
                </tr>
              ) : null}
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className={
                    selectedId === c.id ? "users-row users-row--active" : "users-row"
                  }
                  tabIndex={0}
                  role="button"
                  aria-label={`Открыть историю покупок: ${c.name}`}
                  onClick={() => setSelectedId(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(c.id);
                    }
                  }}
                >
                  <td className="users-mono">{c.createdAt}</td>
                  <td>{c.name}</td>
                  <td className="users-mono">{formatBirthDateRu(c.birthDate)}</td>
                  <td className="users-mono">{c.phone}</td>
                  <td>{c.email}</td>
                  <td>
                    <span
                      className={
                        c.source === "anketa" ?
                          "users-source users-source--anketa"
                        : c.fromBot ?
                          "users-source users-source--bot"
                        : "users-source users-source--tickets"
                      }
                    >
                      {sourceLabel(c.source, c.fromBot)}
                    </span>
                  </td>
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

      {panelOpen ? (
        <div className="users-drawer-root">
          <button
            type="button"
            className="users-drawer-backdrop"
            aria-label="Закрыть"
            onClick={() => setSelectedId(null)}
          />
          <aside
            className="users-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={detailTitleId}
          >
            <div className="users-drawer-head">
              <div>
                <h2 id={detailTitleId} className="users-drawer-title">
                  {detail?.customer.name ?? "Пользователь"}
                </h2>
                {detail ? (
                  <p className="users-drawer-meta">
                    {detail.customer.birthDate ?
                      `ДР ${formatBirthDateRu(detail.customer.birthDate)} · `
                    : ""}
                    {detail.customer.phone}
                    {detail.customer.email ? ` · ${detail.customer.email}` : ""}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="users-btn users-btn--ghost"
                onClick={() => setSelectedId(null)}
              >
                Закрыть
              </button>
            </div>

            {detailLoading ? <p className="users-muted">Загрузка истории…</p> : null}
            {detailErr ? <p className="users-error">{detailErr}</p> : null}

            {detail ? (
              <>
                <div className="users-drawer-badges">
                  <span
                    className={
                      detail.customer.source === "anketa" ?
                        "users-source users-source--anketa"
                      : detail.customer.fromBot ?
                        "users-source users-source--bot"
                      : "users-source users-source--tickets"
                    }
                  >
                    {sourceLabel(detail.customer.source, detail.customer.fromBot)}
                  </span>
                  <span className="users-muted">
                    В базе с {detail.customer.createdAt}
                  </span>
                </div>

                {detail.customer.botTelegramUserIds.length > 0 ? (
                  <p className="users-drawer-bot">
                    Telegram ID:{" "}
                    <span className="users-mono">
                      {detail.customer.botTelegramUserIds.join(", ")}
                    </span>
                  </p>
                ) : null}

                <h3 className="users-drawer-section">История покупок</h3>

                {detail.orders.length === 0 ? (
                  <p className="users-muted">
                    Заказов нет — запись из анкеты контактов.
                  </p>
                ) : (
                  <ul className="users-orders">
                    {detail.orders.map((o) => (
                      <li key={o.id} className="users-order">
                        <div className="users-order-top">
                          <div>
                            <div className="users-order-title">{o.slot.title}</div>
                            <div className="users-muted users-mono">
                              {o.slot.startsAt} · {o.slot.kind}
                            </div>
                          </div>
                          <div className="users-order-sum users-mono">
                            {formatMinorUnits(o.amountCents, o.currency)}
                          </div>
                        </div>
                        <div className="users-order-tags">
                          <span
                            className={`users-status users-status--${o.status.toLowerCase()}`}
                          >
                            {statusLabel(o.status)}
                          </span>
                          {o.fromBot ? (
                            <span className="users-source users-source--bot">Бот</span>
                          ) : null}
                          {o.promoCode ? (
                            <span className="users-mono users-promo">{o.promoCode}</span>
                          ) : null}
                        </div>
                        <div className="users-muted users-order-foot">
                          Создан {o.createdAt}
                          {o.paidAt ? ` · оплачен ${o.paidAt}` : ""}
                          {o.tickets.length > 0 ?
                            ` · билетов: ${o.tickets.length}`
                          : ""}
                          {o.refundedCents > 0 ?
                            ` · возврат ${formatMinorUnits(o.refundedCents, o.currency)}`
                          : ""}
                        </div>
                        {o.tickets.some((t) => t.seatLabel) ? (
                          <div className="users-muted users-order-seats">
                            Места:{" "}
                            {o.tickets
                              .map((t) => t.seatLabel)
                              .filter(Boolean)
                              .join(", ")}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
