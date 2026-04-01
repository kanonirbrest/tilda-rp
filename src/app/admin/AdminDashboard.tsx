"use client";

import { useCallback, useEffect, useState } from "react";

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

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
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

  const [tab, setTab] = useState<"slots" | "orders">("slots");
  const [showInactive, setShowInactive] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [ordersData, setOrdersData] = useState<OrdersResponse | null>(null);
  const [loading, setLoading] = useState(false);

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
    async (options: { preserveMessage?: boolean; inactive?: boolean } = {}) => {
      const all = options.inactive ?? showInactive;
      setErrMsg("");
      if (!options.preserveMessage) setStatusMsg("");
      setLoading(true);
      try {
        const q = all ? "?active=all" : "";
        const data = await apiFetch<SlotsResponse>(`/api/admin/slots${q}`);
        setSlotsData(data);
        if (!options.preserveMessage) setStatusMsg("Слоты загружены.");
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
    setStatusMsg("");
    setLoading(true);
    try {
      const data = await apiFetch<OrdersResponse>("/api/admin/orders?limit=500");
      setOrdersData(data);
      setStatusMsg("Покупки загружены.");
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setOrdersData(null);
    } finally {
      setLoading(false);
    }
  }, []);

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
    setStatusMsg("");
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
      setStatusMsg("Сеанс создан.");
      e.currentTarget.reset();
      await loadSlots({ preserveMessage: true });
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSlot(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    const row = e.currentTarget.closest("tr");
    if (!row) return;
    const title = (row.querySelector('[name="title"]') as HTMLInputElement)?.value ?? "";
    const startsLocal = (row.querySelector('[name="startsAt"]') as HTMLInputElement)?.value ?? "";
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
      if (startsLocal) patch.startsAt = new Date(startsLocal).toISOString();
      patch.capacity = capRaw === "" ? null : Number.parseInt(capRaw, 10);
      await apiFetch(`/api/admin/slots/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setStatusMsg("Сохранено.");
      await loadSlots({ preserveMessage: true });
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="admin-inner">
        <p className="small">Проверка доступа…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="admin-inner">
        <h1>DEI Tickets — вход в админку</h1>
        <p className="small">
          Укажите секрет <code className="mono">ADMIN_API_SECRET</code> из окружения сервера (тот же, что в{" "}
          <code className="mono">.env</code>).
        </p>
        {loginErr ? <p className="err">{loginErr}</p> : null}
        <form className="card" onSubmit={onLogin} style={{ maxWidth: 420 }}>
          <label htmlFor="admin-secret">Секрет</label>
          <input id="admin-secret" name="secret" type="password" autoComplete="off" required />
          <div style={{ marginTop: "0.75rem" }}>
            <button type="submit">Войти</button>
          </div>
        </form>
      </div>
    );
  }

  const byDate = new Map<string, SlotRow[]>();
  if (slotsData) {
    for (const s of slotsData.slots) {
      const list = byDate.get(s.dateKey) ?? [];
      list.push(s);
      byDate.set(s.dateKey, list);
    }
  }
  const dates = slotsData ? [...byDate.keys()].sort() : [];

  return (
    <div className="admin-inner">
      <div className="admin-toolbar">
        <h1 style={{ margin: 0 }}>DEI Tickets — админка</h1>
        <button type="button" className="link-btn" onClick={() => void logout()}>
          Выйти
        </button>
      </div>
      {errMsg ? <p className="err">{errMsg}</p> : null}
      {statusMsg ? <p className="ok">{statusMsg}</p> : null}

      <div className="tabs">
        <button type="button" className={tab === "slots" ? "active" : ""} onClick={() => setTab("slots")}>
          Слоты и лимиты
        </button>
        <button type="button" className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>
          Все покупки
        </button>
      </div>

      {tab === "slots" ? (
        <div className="card">
          <div className="row" style={{ alignItems: "center" }}>
            <button type="button" className={loading ? "is-loading" : ""} onClick={() => void loadSlots()}>
              {loading ? "Загрузка…" : "Обновить список"}
            </button>
            <label className="inline">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => {
                  const v = e.target.checked;
                  setShowInactive(v);
                  void loadSlots({ inactive: v });
                }}
              />
              показать неактивные
            </label>
            <span className="small">
              {slotsData ? `Часовой пояс списка дат: ${slotsData.timezone}` : ""}
            </span>
          </div>
          <p className="small">
            Общее число билетов на сеанс меняется в колонке <strong>«Всего мест»</strong>: введите новое значение и
            нажмите <strong>Сохранить</strong> в строке.
          </p>
          <h2>Новый сеанс</h2>
          <p className="small">
            Цены в <strong>копейках</strong>. Для взрослый / детский / льготный пустое поле = берётся{" "}
            <strong>базовая</strong> цена.
          </p>
          <form onSubmit={(e) => void onNewSlot(e)}>
            <div className="row">
              <div>
                <label>Название</label>
                <input name="title" required placeholder="Экскурсия" />
              </div>
              <div>
                <label>Дата и время (локально в браузере)</label>
                <input name="startsAt" type="datetime-local" required />
              </div>
            </div>
            <div className="row">
              <div>
                <label>Всего мест на сеанс (пусто = без лимита)</label>
                <input name="capacity" type="number" min={1} placeholder="200" />
              </div>
              <div>
                <label>Базовая цена, коп.</label>
                <input name="priceCents" type="number" min={0} defaultValue={1000} required />
              </div>
              <div>
                <label>Валюта</label>
                <input name="currency" defaultValue="BYN" maxLength={8} />
              </div>
            </div>
            <div className="row">
              <div>
                <label>Взрослый, коп. (опционально)</label>
                <input name="priceAdultCents" type="number" min={0} placeholder="как база" />
              </div>
              <div>
                <label>Детский, коп.</label>
                <input name="priceChildCents" type="number" min={0} placeholder="как база" />
              </div>
              <div>
                <label>Льготный, коп.</label>
                <input name="priceConcessionCents" type="number" min={0} placeholder="как база" />
              </div>
            </div>
            <button type="submit" disabled={loading}>
              Создать
            </button>
          </form>

          {!slotsData ? (
            <p className="small">Нажмите «Обновить список», чтобы загрузить слоты.</p>
          ) : slotsData.slots.length === 0 ? (
            <p>Нет слотов.</p>
          ) : (
            dates.map((d) => (
              <div key={d}>
                <div className="date-group">{d}</div>
                <table>
                  <thead>
                    <tr>
                      <th>Время (календарь)</th>
                      <th>Название</th>
                      <th>Цены, коп.</th>
                      <th>Всего мест</th>
                      <th>Оплачено</th>
                      <th>В ожидании</th>
                      <th>Активен</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(byDate.get(d) ?? []).map((s) => {
                      const cap = s.capacity == null ? "∞" : String(s.capacity);
                      const free =
                        s.capacity == null ? "—" : String(Math.max(0, s.capacity - s.soldPaid - s.pendingReserved));
                      return (
                        <tr key={s.id}>
                          <td>
                            <input
                              name="startsAt"
                              type="datetime-local"
                              defaultValue={isoToDatetimeLocal(s.startsAt)}
                              style={{ maxWidth: "11rem", font: "inherit" }}
                            />
                            <div className="small mono">было: {s.timeKey}</div>
                          </td>
                          <td>
                            <input name="title" defaultValue={s.title} style={{ maxWidth: "14rem" }} />
                          </td>
                          <td>
                            <div className="price-grid">
                              <span className="small">База</span>
                              <input name="priceCents" type="number" min={0} defaultValue={s.priceCents} />
                              <span className="small">Взр.</span>
                              <input
                                name="priceAdultCents"
                                type="number"
                                min={0}
                                placeholder="база"
                                defaultValue={s.priceAdultCents ?? ""}
                              />
                              <span className="small">Дет.</span>
                              <input
                                name="priceChildCents"
                                type="number"
                                min={0}
                                placeholder="база"
                                defaultValue={s.priceChildCents ?? ""}
                              />
                              <span className="small">Льг.</span>
                              <input
                                name="priceConcessionCents"
                                type="number"
                                min={0}
                                placeholder="база"
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
                              title="Общий лимит билетов на этот сеанс"
                              defaultValue={s.capacity ?? ""}
                              style={{ width: "5rem" }}
                            />
                            <div className="small">
                              Осталось: {free} · всего в лимите: {cap}
                            </div>
                          </td>
                          <td>{s.soldPaid}</td>
                          <td>{s.pendingReserved}</td>
                          <td>
                            <label className="inline">
                              <input type="checkbox" name="active" defaultChecked={s.active} />
                            </label>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="secondary"
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
            ))
          )}
        </div>
      ) : (
        <div className="card">
          <div className="row">
            <button type="button" className={loading ? "is-loading" : ""} onClick={() => void loadOrders()}>
              {loading ? "Загрузка…" : "Загрузить покупки"}
            </button>
            <span className="small">
              {ordersData ? `Всего в базе: ${ordersData.total}, показано: ${ordersData.orders.length}` : ""}
            </span>
          </div>
          <div className="orders-wrap">
            {!ordersData ? (
              <p className="small">Нажмите «Загрузить покупки».</p>
            ) : ordersData.orders.length === 0 ? (
              <p>Заказов нет.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Дата заказа</th>
                    <th>Статус</th>
                    <th>Сумма</th>
                    <th>Клиент</th>
                    <th>Сеанс</th>
                    <th>Состав</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData.orders.map((o) => {
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
                          <br />
                          <span className="small">
                            {o.customer.email}
                            <br />
                            {o.customer.phone}
                          </span>
                        </td>
                        <td>
                          {o.slot.title}
                          <br />
                          <span className="small mono">{o.slot.startsAt.slice(0, 16).replace("T", " ")}</span>
                        </td>
                        <td className="small">{lines}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
