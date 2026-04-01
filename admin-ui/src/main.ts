import "./style.css";

/** Задайте в `admin-ui/.env`: `VITE_API_BASE`, `VITE_ADMIN_TOKEN` (попадают в бандл при сборке). */
const ENV_API_BASE = (import.meta.env.VITE_API_BASE ?? "").trim().replace(/\/$/, "");
const ENV_ADMIN_TOKEN = (import.meta.env.VITE_ADMIN_TOKEN ?? "").trim();

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getBase(): string {
  return ENV_API_BASE;
}

function getSecret(): string {
  return ENV_ADMIN_TOKEN;
}

function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBase();
  const secret = getSecret();
  if (!base || !secret) {
    throw new Error(
      "Задайте VITE_API_BASE и VITE_ADMIN_TOKEN в admin-ui/.env (см. .env.example) и пересоберите или перезапустите npm run dev.",
    );
  }
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
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

/** Пусто → null (для типа = брать базовую цену слота). */
function parseOptCents(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

const app = document.querySelector<HTMLDivElement>("#app")!;

let tab: "slots" | "orders" = "slots";
let showInactive = false;
let statusMsg = "";
let errMsg = "";
let slotsData: SlotsResponse | null = null;
let ordersData: OrdersResponse | null = null;
let loading = false;

function render(): void {
  app.innerHTML = `
    <h1>DEI Tickets — админка</h1>
    ${errMsg ? `<p class="err">${esc(errMsg)}</p>` : ""}
    ${statusMsg ? `<p class="ok">${esc(statusMsg)}</p>` : ""}

    <div class="tabs">
      <button type="button" class="${tab === "slots" ? "active" : ""}" data-tab="slots">Слоты и лимиты</button>
      <button type="button" class="${tab === "orders" ? "active" : ""}" data-tab="orders">Все покупки</button>
    </div>

    <div id="tab-body"></div>
  `;

  const tabBody = document.querySelector("#tab-body")!;

  if (tab === "slots") {
    tabBody.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:center">
          <button type="button" id="btn-refresh-slots" ${loading ? "disabled" : ""}>Обновить список</button>
          <label class="inline"><input type="checkbox" id="chk-inactive" ${showInactive ? "checked" : ""} />
            показать неактивные</label>
          <span class="small">${slotsData ? `Часовой пояс списка дат: ${esc(slotsData.timezone)}` : ""}</span>
        </div>
        <p class="small">Общее число билетов на сеанс меняется в колонке <strong>«Всего мест»</strong>: введите новое значение (например 250 вместо 200) и нажмите <strong>Сохранить</strong> в строке. Уменьшить можно только до числа не меньше уже занятых (оплачено + в ожидании).</p>
        <h2>Новый сеанс</h2>
        <p class="small">Цены в <strong>копейках</strong>. Для взрослый / детский / льготный пустое поле = для этого типа берётся <strong>базовая</strong> цена (как в оплате и на сайте).</p>
        <form id="form-new-slot">
          <div class="row">
            <div><label>Название</label><input name="title" required placeholder="Экскурсия" /></div>
            <div><label>Дата и время (локально в браузере)</label><input name="startsAt" type="datetime-local" required /></div>
          </div>
          <div class="row">
            <div><label>Всего мест на сеанс (пусто = без лимита)</label><input name="capacity" type="number" min="1" placeholder="200" /></div>
            <div><label>Базовая цена, коп.</label><input name="priceCents" type="number" min="0" value="1000" required /></div>
            <div><label>Валюта</label><input name="currency" value="BYN" maxlength="8" /></div>
          </div>
          <div class="row">
            <div><label>Взрослый, коп. (опционально)</label><input name="priceAdultCents" type="number" min="0" placeholder="как база" /></div>
            <div><label>Детский, коп.</label><input name="priceChildCents" type="number" min="0" placeholder="как база" /></div>
            <div><label>Льготный, коп.</label><input name="priceConcessionCents" type="number" min="0" placeholder="как база" /></div>
          </div>
          <button type="submit" ${loading ? "disabled" : ""}>Создать</button>
        </form>
        <div id="slots-table">${renderSlotsTable(slotsData)}</div>
      </div>
    `;
  } else {
    tabBody.innerHTML = `
      <div class="card">
        <div class="row">
          <button type="button" id="btn-refresh-orders" ${loading ? "disabled" : ""}>Загрузить покупки</button>
          <span class="small">${ordersData ? `Всего в базе: ${ordersData.total}, показано: ${ordersData.orders.length}` : ""}</span>
        </div>
        <div id="orders-table" class="orders-wrap">${renderOrdersTable(ordersData)}</div>
      </div>
    `;
  }

  document.querySelectorAll("[data-tab]").forEach((b) => {
    b.addEventListener("click", () => {
      tab = (b as HTMLButtonElement).dataset.tab as "slots" | "orders";
      errMsg = "";
      render();
    });
  });

  document.querySelector("#btn-refresh-slots")?.addEventListener("click", () => void loadSlots());
  document.querySelector("#chk-inactive")?.addEventListener("change", (e) => {
    showInactive = (e.target as HTMLInputElement).checked;
    void loadSlots();
  });

  document.querySelector("#form-new-slot")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
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
    const body: Record<string, unknown> = {
      title,
      startsAt,
      priceCents,
      currency,
    };
    if (capRaw) body.capacity = Number.parseInt(capRaw, 10);
    if (pa !== null) body.priceAdultCents = pa;
    if (pc !== null) body.priceChildCents = pc;
    if (pco !== null) body.priceConcessionCents = pco;
    errMsg = "";
    loading = true;
    render();
    try {
      await apiFetch("/api/admin/slots", { method: "POST", body: JSON.stringify(body) });
      statusMsg = "Сеанс создан.";
      (e.target as HTMLFormElement).reset();
      await loadSlots({ preserveMessage: true });
    } catch (e: unknown) {
      errMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
      render();
    }
  });

  document.querySelector("#btn-refresh-orders")?.addEventListener("click", () => void loadOrders());

  document.querySelector("#slots-table")?.addEventListener("click", async (e) => {
    const t = (e.target as HTMLElement).closest("[data-save-slot]");
    if (!t) return;
    const id = (t as HTMLButtonElement).dataset.saveSlot;
    if (!id) return;
    const row = document.querySelector(`[data-slot-row="${CSS.escape(id)}"]`);
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
    errMsg = "";
    loading = true;
    render();
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
      statusMsg = "Сохранено.";
      await loadSlots({ preserveMessage: true });
    } catch (err: unknown) {
      errMsg = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
      render();
    }
  });
}

function renderSlotsTable(data: SlotsResponse | null): string {
  if (!data) {
    return '<p class="small">Нажмите «Обновить список», чтобы загрузить слоты.</p>';
  }
  if (data.slots.length === 0) {
    return "<p>Нет слотов.</p>";
  }
  const byDate = new Map<string, SlotRow[]>();
  for (const s of data.slots) {
    const list = byDate.get(s.dateKey) ?? [];
    list.push(s);
    byDate.set(s.dateKey, list);
  }
  const dates = [...byDate.keys()].sort();
  let html = "";
  for (const d of dates) {
    html += `<div class="date-group">${esc(d)}</div>`;
    html += `<table><thead><tr>
      <th>Время (календарь)</th><th>Название</th><th>Цены, коп. (база / типы)</th><th>Всего мест</th><th>Оплачено</th><th>В ожидании</th><th>Активен</th><th></th>
    </tr></thead><tbody>`;
    for (const s of byDate.get(d)!) {
      const cap = s.capacity == null ? "∞" : String(s.capacity);
      const free =
        s.capacity == null ? "—" : String(Math.max(0, s.capacity - s.soldPaid - s.pendingReserved));
      html += `<tr data-slot-row="${esc(s.id)}">
        <td>
          <input name="startsAt" type="datetime-local" value="${esc(isoToDatetimeLocal(s.startsAt))}" style="max-width:11rem;font:inherit" />
          <div class="small mono">было: ${esc(s.timeKey)}</div>
        </td>
        <td><input name="title" value="${esc(s.title)}" style="max-width:14rem" /></td>
        <td>
          <div class="price-grid">
            <span class="small">База</span><input name="priceCents" type="number" min="0" value="${s.priceCents}" />
            <span class="small">Взр.</span><input name="priceAdultCents" type="number" min="0" placeholder="база" value="${s.priceAdultCents ?? ""}" />
            <span class="small">Дет.</span><input name="priceChildCents" type="number" min="0" placeholder="база" value="${s.priceChildCents ?? ""}" />
            <span class="small">Льг.</span><input name="priceConcessionCents" type="number" min="0" placeholder="база" value="${s.priceConcessionCents ?? ""}" />
          </div>
        </td>
        <td>
          <input name="capacity" type="number" min="1" placeholder="∞" title="Общий лимит билетов на этот сеанс" value="${s.capacity ?? ""}" style="width:5rem" />
          <div class="small">Осталось: ${esc(free)} · всего в лимите: ${esc(cap)}</div>
        </td>
        <td>${s.soldPaid}</td>
        <td>${s.pendingReserved}</td>
        <td><label class="inline"><input type="checkbox" name="active" ${s.active ? "checked" : ""} /></label></td>
        <td>
          <button type="button" class="secondary" data-save-slot="${esc(s.id)}">Сохранить</button>
        </td>
      </tr>`;
    }
    html += "</tbody></table>";
  }
  return html;
}

function renderOrdersTable(data: OrdersResponse | null): string {
  if (!data) {
    return '<p class="small">Нажмите «Загрузить покупки».</p>';
  }
  if (data.orders.length === 0) {
    return "<p>Заказов нет.</p>";
  }
  let html = `<table><thead><tr>
    <th>Дата заказа</th><th>Статус</th><th>Сумма</th><th>Клиент</th><th>Сеанс</th><th>Состав</th>
  </tr></thead><tbody>`;
  for (const o of data.orders) {
    const st = o.status.toLowerCase();
    const pillClass =
      st === "paid" ? "paid"
      : st === "pending" ? "pending"
      : st === "failed" ? "failed"
      : "cancelled";
    const lines = o.lines.map((l) => `${tierRu(l.tier)} ×${l.quantity}`).join(", ");
    html += `<tr>
      <td class="mono">${esc(o.createdAt.slice(0, 19).replace("T", " "))}</td>
      <td><span class="pill ${pillClass}">${esc(o.status)}</span></td>
      <td>${esc(money(o.amountCents, o.currency))}</td>
      <td>${esc(o.customer.name)}<br/><span class="small">${esc(o.customer.email)}<br/>${esc(o.customer.phone)}</span></td>
      <td>${esc(o.slot.title)}<br/><span class="small mono">${esc(o.slot.startsAt.slice(0, 16).replace("T", " "))}</span></td>
      <td class="small">${esc(lines)}</td>
    </tr>`;
  }
  html += "</tbody></table>";
  return html;
}

async function loadSlots(options: { preserveMessage?: boolean } = {}): Promise<void> {
  if (!getBase() || !getSecret()) {
    errMsg =
      "Задайте VITE_API_BASE и VITE_ADMIN_TOKEN в admin-ui/.env и перезапустите dev или пересоберите.";
    render();
    return;
  }
  errMsg = "";
  loading = true;
  if (!options.preserveMessage) statusMsg = "";
  render();
  try {
    const q = showInactive ? "?active=all" : "";
    slotsData = await apiFetch<SlotsResponse>(`/api/admin/slots${q}`);
    if (!options.preserveMessage) statusMsg = "Слоты загружены.";
  } catch (e: unknown) {
    errMsg = e instanceof Error ? e.message : String(e);
    slotsData = null;
  } finally {
    loading = false;
    render();
  }
}

async function loadOrders(): Promise<void> {
  if (!getBase() || !getSecret()) {
    errMsg =
      "Задайте VITE_API_BASE и VITE_ADMIN_TOKEN в admin-ui/.env и перезапустите dev или пересоберите.";
    render();
    return;
  }
  errMsg = "";
  loading = true;
  statusMsg = "";
  render();
  try {
    ordersData = await apiFetch<OrdersResponse>("/api/admin/orders?limit=500");
    statusMsg = "Покупки загружены.";
  } catch (e: unknown) {
    errMsg = e instanceof Error ? e.message : String(e);
    ordersData = null;
  } finally {
    loading = false;
    render();
  }
}

render();
