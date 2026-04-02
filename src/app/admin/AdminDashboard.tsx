"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SlotRow = {
  id: string;
  title: string;
  startsAt: string;
  dateKey: string;
  timeKey: string;
  capacity: number | null;
  soldPaid: number;
  pendingReserved: number;
  priceCents: number;
  priceAdultCents: number | null;
  priceChildCents: number | null;
  priceConcessionCents: number | null;
  currency: string;
  active: boolean;
};

type SlotsResponse = { timezone: string; slots: SlotRow[] };

type OrderRow = {
  id: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  amountCents: number;
  currency: string;
  customer: { name: string; email: string; phone: string };
  slot: { id: string; title: string; startsAt: string };
  lines: { tier: string; quantity: number; unitPriceCents: number }[];
};

type OrdersResponse = {
  total: number;
  limit: number;
  offset: number;
  orders: OrderRow[];
};

type TabId = "orders" | "schedule" | "create";

function tierRu(t: string): string {
  if (t === "ADULT") return "взр.";
  if (t === "CHILD") return "дет.";
  return "льг.";
}

function money(cents: number, cur: string): string {
  return `${(cents / 100).toFixed(2)} ${cur}`;
}

function parseOptCents(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Для datetime-local и для вырезки локальной даты/времени (календарь браузера). */
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isoToTimeLocalHHmm(iso: string): string {
  const s = isoToDatetimeLocal(iso);
  const t = s.split("T")[1];
  return t ?? "";
}

/** Подпись кнопки даты: 2026-04-03 → «3 апр.» без сдвига по TZ */
function formatDateKeyShort(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
}

function todayDateKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function isActiveOrderStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "pending" || s === "paid";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

export default function AdminDashboard() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  const [tab, setTab] = useState<TabId>("orders");
  const [showInactive, setShowInactive] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [ordersData, setOrdersData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayDateKey);

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

  const loadSlots = useCallback(
    async (options: { inactive?: boolean } = {}) => {
      const all = options.inactive ?? showInactive;
      setErrMsg("");
      setLoading(true);
      try {
        const q = all ? "?active=all" : "";
        const data = await apiFetch<SlotsResponse>(`/api/admin/slots${q}`);
        setSlotsData(data);
      } catch (e: unknown) {
        setErrMsg(e instanceof Error ? e.message : String(e));
        setSlotsData(null);
      } finally {
        setLoading(false);
      }
    },
    [showInactive],
  );

  const loadOrders = useCallback(async () => {
    setErrMsg("");
    setLoading(true);
    try {
      const data = await apiFetch<OrdersResponse>("/api/admin/orders?limit=500");
      setOrdersData(data);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setOrdersData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked || !authed) return;
    void loadOrders();
  }, [authChecked, authed, loadOrders]);

  useEffect(() => {
    if (!authed || tab !== "schedule") return;
    void loadSlots();
  }, [authed, tab, loadSlots]);

  async function onLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginErr("");
    const fd = new FormData(e.currentTarget);
    const secret = String(fd.get("secret") ?? "");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ secret }),
      });
      const text = await r.text();
      if (!r.ok) {
        let msg = text;
        try {
          const j = JSON.parse(text) as { message?: string };
          if (j.message) msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg || `HTTP ${r.status}`);
      }
      setAuthed(true);
    } catch (err: unknown) {
      setLoginErr(err instanceof Error ? err.message : String(err));
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
    setAuthed(false);
    setSlotsData(null);
    setOrdersData(null);
    setErrMsg("");
  }

  async function onNewSlot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") || "");
    const startsLocal = String(fd.get("startsAt") || "");
    const capRaw = String(fd.get("capacity") || "").trim();
    const priceCents = Number.parseInt(String(fd.get("priceCents") || "0"), 10);
    const currency = String(fd.get("currency") || "BYN").trim() || "BYN";
    const pa = parseOptCents(String(fd.get("priceAdultCents") ?? ""));
    const pc = parseOptCents(String(fd.get("priceChildCents") ?? ""));
    const pco = parseOptCents(String(fd.get("priceConcessionCents") ?? ""));
    if (!startsLocal) return;
    const startsAt = new Date(startsLocal).toISOString();
    const body: Record<string, unknown> = { title, startsAt, priceCents, currency };
    if (capRaw) body.capacity = Number.parseInt(capRaw, 10);
    if (pa !== null) body.priceAdultCents = pa;
    if (pc !== null) body.priceChildCents = pc;
    if (pco !== null) body.priceConcessionCents = pco;
    setErrMsg("");
    setLoading(true);
    try {
      await apiFetch("/api/admin/slots", { method: "POST", body: JSON.stringify(body) });
      e.currentTarget.reset();
      await loadSlots();
      setTab("schedule");
      const d = new Date(startsLocal);
      const p = (n: number) => String(n).padStart(2, "0");
      setSelectedDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSlot(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    const row = e.currentTarget.closest("tr");
    if (!row) return;
    const slot = slotsData?.slots.find((x) => x.id === id);
    const title = (row.querySelector('[name="title"]') as HTMLInputElement)?.value ?? "";
    const timePart = (row.querySelector('[name="slotTime"]') as HTMLInputElement)?.value ?? "";
    const datePart = slot ? isoToDatetimeLocal(slot.startsAt).split("T")[0] : "";
    const capRaw = (row.querySelector('[name="capacity"]') as HTMLInputElement)?.value?.trim() ?? "";
    const active = (row.querySelector('[name="active"]') as HTMLInputElement)?.checked ?? true;
    const priceCents = Number.parseInt(
      (row.querySelector('[name="priceCents"]') as HTMLInputElement)?.value ?? "0",
      10,
    );
    const priceAdultCents = parseOptCents(
      (row.querySelector('[name="priceAdultCents"]') as HTMLInputElement)?.value ?? "",
    );
    const priceChildCents = parseOptCents(
      (row.querySelector('[name="priceChildCents"]') as HTMLInputElement)?.value ?? "",
    );
    const priceConcessionCents = parseOptCents(
      (row.querySelector('[name="priceConcessionCents"]') as HTMLInputElement)?.value ?? "",
    );
    setErrMsg("");
    setLoading(true);
    try {
      const patch: Record<string, unknown> = {
        title: title.trim(),
        active,
        priceCents: Number.isFinite(priceCents) && priceCents >= 0 ? priceCents : 0,
        priceAdultCents,
        priceChildCents,
        priceConcessionCents,
      };
      if (datePart && timePart) {
        patch.startsAt = new Date(`${datePart}T${timePart}:00`).toISOString();
      }
      patch.capacity = capRaw === "" ? null : Number.parseInt(capRaw, 10);
      await apiFetch(`/api/admin/slots/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadSlots();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const activeOrders = useMemo(
    () => ordersData?.orders.filter((o) => isActiveOrderStatus(o.status)) ?? [],
    [ordersData],
  );

  const slotsForSelectedDate = useMemo(() => {
    if (!slotsData) return [];
    return slotsData.slots
      .filter((s) => s.dateKey === selectedDate)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [slotsData, selectedDate]);

  const dateOptions = useMemo(() => {
    if (!slotsData) return [];
    const keys = new Set(slotsData.slots.map((s) => s.dateKey));
    return [...keys].sort();
  }, [slotsData]);

  if (!authChecked) {
    return (
      <div className="admin-inner">
        <div className="admin-empty">
          <span className="admin-spinner" aria-hidden />
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="admin-inner admin-login">
        <div className="admin-login-card">
          <h1 className="admin-login-title">Вход</h1>
          <p className="admin-login-sub">Секрет из окружения сервера</p>
          {loginErr ? <div className="admin-alert admin-alert--err">{loginErr}</div> : null}
          <form onSubmit={onLogin}>
            <label htmlFor="admin-secret">Секрет</label>
            <input id="admin-secret" name="secret" type="password" autoComplete="off" required />
            <div style={{ marginTop: "1rem" }}>
              <button type="submit" className="btn">
                Войти
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-inner">
      <header className="admin-app-header">
        <div className="admin-brand">
          <span className="admin-brand-mark">DEI</span>
          <h1 className="admin-brand-title">Админка билетов</h1>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void logout()}>
          Выйти
        </button>
      </header>

      {errMsg ? <div className="admin-alert admin-alert--err">{errMsg}</div> : null}

      <div className="admin-tabs" role="tablist" aria-label="Разделы">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "orders"}
          onClick={() => setTab("orders")}
        >
          {ordersData ? `Заявки · ${activeOrders.length}` : "Заявки"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "schedule"}
          onClick={() => setTab("schedule")}
        >
          Сеансы по дате
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "create"}
          onClick={() => setTab("create")}
        >
          Новый сеанс
        </button>
      </div>

      {tab === "orders" ? (
        <section className="admin-panel" id="tab-orders" aria-label="Заявки">
          <div className="admin-panel-head">
            <div className="admin-toolbar-row">
              <button
                type="button"
                className={`btn btn-secondary ${loading ? "is-loading" : ""}`}
                onClick={() => void loadOrders()}
                disabled={loading}
              >
                Обновить
              </button>
              {ordersData ? (
                <span className="admin-hint">
                  Активных: {activeOrders.length} · всего в выборке: {ordersData.orders.length}
                </span>
              ) : null}
            </div>
          </div>
          <div className="admin-table-wrap">
            {!ordersData ? (
              <div className="admin-empty">Загрузка…</div>
            ) : activeOrders.length === 0 ? (
              <div className="admin-empty">Нет активных заявок</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Статус</th>
                    <th>Сумма</th>
                    <th>Клиент</th>
                    <th>Сеанс</th>
                    <th>Состав</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrders.map((o) => {
                    const st = o.status.toLowerCase();
                    const pillClass =
                      st === "paid" ? "paid"
                      : st === "pending" ? "pending"
                      : st === "failed" ? "failed"
                      : "cancelled";
                    const lines = o.lines.map((l) => `${tierRu(l.tier)} ×${l.quantity}`).join(", ");
                    return (
                      <tr key={o.id}>
                        <td className="mono">{o.createdAt.slice(0, 19).replace("T", " ")}</td>
                        <td>
                          <span className={`pill ${pillClass}`}>{o.status}</span>
                        </td>
                        <td>{money(o.amountCents, o.currency)}</td>
                        <td>
                          {o.customer.name}
                          <div className="admin-muted-text">
                            {o.customer.email}
                            <br />
                            {o.customer.phone}
                          </div>
                        </td>
                        <td>
                          {o.slot.title}
                          <div className="admin-muted-text mono">{o.slot.startsAt.slice(0, 16).replace("T", " ")}</div>
                        </td>
                        <td className="admin-muted-text">{lines}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section className="admin-panel" id="tab-schedule" aria-label="Сеансы по дате">
          <div className="admin-panel-head admin-panel-head--stack">
            <div className="admin-toolbar-row">
              <button
                type="button"
                className={`btn btn-secondary ${loading ? "is-loading" : ""}`}
                onClick={() => void loadSlots()}
                disabled={loading}
              >
                Обновить
              </button>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setShowInactive(v);
                    void loadSlots({ inactive: v });
                  }}
                />
                Неактивные
              </label>
              {slotsData ? <span className="admin-hint mono">{slotsData.timezone}</span> : null}
            </div>
            <div className="admin-field admin-field--dateblock">
              <label htmlFor="slot-date">Дата</label>
              <div className="admin-date-row">
                <input
                  id="slot-date"
                  className="admin-date-input"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => setSelectedDate(todayDateKey())}
                >
                  Сегодня
                </button>
              </div>
              {dateOptions.length > 0 ? (
                <div className="admin-date-chips" role="group" aria-label="Даты с сеансами">
                  {dateOptions.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`admin-chip ${d === selectedDate ? "admin-chip--on" : ""}`}
                      onClick={() => setSelectedDate(d)}
                    >
                      {formatDateKeyShort(d)}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="admin-hint admin-hint--tight">Загрузите список — появятся быстрые переходы по датам.</p>
              )}
            </div>
          </div>
          {!slotsData ? (
            <div className="admin-empty">Загрузка…</div>
          ) : slotsForSelectedDate.length === 0 ? (
            <div className="admin-empty">На эту дату сеансов нет</div>
          ) : (
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Время</th>
                    <th>Название</th>
                    <th>Цены, коп.</th>
                    <th>Места</th>
                    <th>Оплач.</th>
                    <th>Ожид.</th>
                    <th>Акт.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {slotsForSelectedDate.map((s) => {
                    const cap = s.capacity == null ? "∞" : String(s.capacity);
                    const free =
                      s.capacity == null ? "—" : String(Math.max(0, s.capacity - s.soldPaid - s.pendingReserved));
                    return (
                      <tr key={s.id}>
                        <td className="admin-cell-time">
                          <input
                            name="slotTime"
                            type="time"
                            step={60}
                            className="admin-input-time"
                            defaultValue={isoToTimeLocalHHmm(s.startsAt)}
                            aria-label={`Время сеанса, строка ${s.timeKey}`}
                          />
                          <div className="admin-muted-text mono">
                            {s.timeKey} · {slotsData.timezone}
                          </div>
                        </td>
                        <td>
                          <input name="title" defaultValue={s.title} />
                        </td>
                        <td>
                          <div className="price-grid">
                            <span className="admin-muted-text">База</span>
                            <input name="priceCents" type="number" min={0} defaultValue={s.priceCents} />
                            <span className="admin-muted-text">Взр.</span>
                            <input
                              name="priceAdultCents"
                              type="number"
                              min={0}
                              placeholder="—"
                              defaultValue={s.priceAdultCents ?? ""}
                            />
                            <span className="admin-muted-text">Дет.</span>
                            <input
                              name="priceChildCents"
                              type="number"
                              min={0}
                              placeholder="—"
                              defaultValue={s.priceChildCents ?? ""}
                            />
                            <span className="admin-muted-text">Льг.</span>
                            <input
                              name="priceConcessionCents"
                              type="number"
                              min={0}
                              placeholder="—"
                              defaultValue={s.priceConcessionCents ?? ""}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            name="capacity"
                            type="number"
                            min={1}
                            placeholder="∞"
                            title="Лимит билетов"
                            defaultValue={s.capacity ?? ""}
                          />
                          <div className="admin-muted-text">
                            своб.: {free} / {cap}
                          </div>
                        </td>
                        <td>{s.soldPaid}</td>
                        <td>{s.pendingReserved}</td>
                        <td>
                          <label className="admin-check">
                            <input type="checkbox" name="active" defaultChecked={s.active} />
                          </label>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={(e) => void saveSlot(e, s.id)}
                            disabled={loading}
                          >
                            Сохранить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "create" ? (
        <section className="admin-panel" id="tab-create" aria-label="Новый сеанс">
          <form onSubmit={(e) => void onNewSlot(e)}>
            <div className="admin-row">
              <div className="admin-field">
                <label>Название</label>
                <input name="title" required placeholder="Сеанс" />
              </div>
              <div className="admin-field">
                <label>Дата и время</label>
                <input name="startsAt" type="datetime-local" required />
              </div>
            </div>
            <div className="admin-row">
              <div className="admin-field admin-field-narrow">
                <label>Лимит мест</label>
                <input name="capacity" type="number" min={1} placeholder="∞" />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>База, коп.</label>
                <input name="priceCents" type="number" min={0} defaultValue={1000} required />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>Валюта</label>
                <input name="currency" defaultValue="BYN" maxLength={8} />
              </div>
            </div>
            <div className="admin-row">
              <div className="admin-field admin-field-narrow">
                <label>Взрослый, коп.</label>
                <input name="priceAdultCents" type="number" min={0} placeholder="база" />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>Детский</label>
                <input name="priceChildCents" type="number" min={0} placeholder="база" />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>Льготный</label>
                <input name="priceConcessionCents" type="number" min={0} placeholder="база" />
              </div>
            </div>
            <button type="submit" className="btn" disabled={loading}>
              Создать
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
