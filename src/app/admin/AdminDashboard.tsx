"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatMinorUnits,
  minorToMajorNumber,
  parseMajorUnitsToMinor,
  parseOptionalMajorUnitsToMinor,
} from "@/lib/money";
import { tierTicketSingularRu } from "@/lib/slot-pricing";
import type { TicketTier } from "@prisma/client";

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

type OrderVisitState = "na" | "not_visited" | "partial" | "visited";

type OrderRow = {
  id: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  subtotalCents: number;
  discountCents: number;
  amountCents: number;
  currency: string;
  promoCode: string | null;
  visitState: OrderVisitState;
  visitedAt: string | null;
  tickets: { id: string; tier: TicketTier | null; admissionCount: number; usedAt: string | null }[];
  customer: { name: string; email: string; phone: string };
  slot: { id: string; title: string; startsAt: string };
  lines: { tier: string; quantity: number; unitPriceCents: number }[];
};

type PromoRow = {
  id: string;
  code: string;
  active: boolean;
  discountKind: "PERCENT" | "FIXED_CENTS";
  discountValue: number;
  maxUses: number | null;
  validFrom: string | null;
  validUntil: string | null;
  createdAt: string;
  reservedOrders: number;
};

type OrdersResponse = {
  total: number;
  limit: number;
  offset: number;
  orders: OrderRow[];
};

type TabId = "orders" | "schedule" | "promos";

type AdminModal =
  | { type: "none" }
  | { type: "order"; order: OrderRow }
  | { type: "slot-single" }
  | { type: "slot-bulk" }
  | { type: "slot-edit"; slot: SlotRow }
  | { type: "promo-new" }
  | { type: "promo-edit"; promo: PromoRow };

function tierRu(t: string): string {
  if (t === "ADULT") return "взр.";
  if (t === "CHILD") return "дет.";
  return "льг.";
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

/** Плашка прохода рядом со статусом оплаты (только для PAID). */
function visitPillForOrder(visitState: OrderVisitState): { cls: string; label: string } | null {
  if (visitState === "na") return null;
  if (visitState === "visited") return { cls: "visit-yes", label: "прошёл" };
  if (visitState === "partial") return { cls: "visit-partial", label: "частично" };
  return { cls: "visit-no", label: "не прошёл" };
}

type OrderPayFilter = "all" | "paid" | "pending";
type OrderVisitFilter = "all" | "visited" | "not_visited" | "partial" | "not_full";

function orderMatchesFilters(
  o: OrderRow,
  pay: OrderPayFilter,
  visit: OrderVisitFilter,
): boolean {
  const st = o.status.toUpperCase();
  if (pay === "paid" && st !== "PAID") return false;
  if (pay === "pending" && st !== "PENDING") return false;
  if (pay === "all" && !isActiveOrderStatus(o.status)) return false;

  if (st !== "PAID") {
    return visit === "all";
  }

  if (visit === "all") return true;
  if (visit === "visited") return o.visitState === "visited";
  if (visit === "not_visited") return o.visitState === "not_visited";
  if (visit === "partial") return o.visitState === "partial";
  if (visit === "not_full") return o.visitState === "not_visited" || o.visitState === "partial";
  return true;
}

function truncateText(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

/** Сохранённый секрет входа в админку (только клиент; при XSS доступен скриптам). */
const ADMIN_UI_SECRET_STORAGE_KEY = "dei_admin_ui_secret";

function readStoredAdminSecret(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(ADMIN_UI_SECRET_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeStoredAdminSecret(secret: string): void {
  if (typeof window === "undefined") return;
  try {
    if (secret) window.localStorage.setItem(ADMIN_UI_SECRET_STORAGE_KEY, secret);
    else window.localStorage.removeItem(ADMIN_UI_SECRET_STORAGE_KEY);
  } catch {
    /* quota / private mode */
  }
}

function AdminModalFrame({
  title,
  onClose,
  children,
  size = "default",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: "default" | "wide";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="admin-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`admin-modal${size === "wide" ? " admin-modal--wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-head">
          <h2 id="admin-modal-title" className="admin-modal-title">
            {title}
          </h2>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
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
  const [adminSecretInput, setAdminSecretInput] = useState("");

  const [tab, setTab] = useState<TabId>("orders");
  const [modal, setModal] = useState<AdminModal>({ type: "none" });
  const [showInactive, setShowInactive] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [slotsData, setSlotsData] = useState<SlotsResponse | null>(null);
  const [ordersData, setOrdersData] = useState<OrdersResponse | null>(null);
  const [orderPayFilter, setOrderPayFilter] = useState<OrderPayFilter>("all");
  const [orderVisitFilter, setOrderVisitFilter] = useState<OrderVisitFilter>("all");
  const [promosData, setPromosData] = useState<PromoRow[] | null>(null);
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

  useEffect(() => {
    if (authChecked && !authed) setAdminSecretInput(readStoredAdminSecret());
  }, [authChecked, authed]);

  useEffect(() => {
    if (orderPayFilter === "pending") setOrderVisitFilter("all");
  }, [orderPayFilter]);

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

  const loadPromos = useCallback(async () => {
    setErrMsg("");
    setLoading(true);
    try {
      const data = await apiFetch<PromoRow[]>("/api/admin/promo-codes");
      setPromosData(data);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setPromosData(null);
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

  useEffect(() => {
    if (!authed || tab !== "promos") return;
    void loadPromos();
  }, [authed, tab, loadPromos]);

  async function onLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginErr("");
    const secret = adminSecretInput.trim();
    if (!secret) {
      setLoginErr("Введите секрет");
      return;
    }
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
      writeStoredAdminSecret(secret);
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
    setPromosData(null);
    setErrMsg("");
  }

  async function onCreatePromo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const code = String(fd.get("code") ?? "").trim();
    const discountKind = String(fd.get("discountKind") ?? "PERCENT") as "PERCENT" | "FIXED_CENTS";
    let discountValue: number;
    if (discountKind === "PERCENT") {
      discountValue = Number.parseInt(String(fd.get("discountPercent") ?? ""), 10);
    } else {
      discountValue = parseMajorUnitsToMinor(String(fd.get("discountFixedMajor") ?? "0"));
    }
    const maxUsesRaw = String(fd.get("maxUses") ?? "").trim();
    const maxUses =
      maxUsesRaw === "" || !Number.isFinite(Number.parseInt(maxUsesRaw, 10)) ?
        null
      : Number.parseInt(maxUsesRaw, 10);
    const validFromLocal = String(fd.get("validFrom") ?? "").trim();
    const validUntilLocal = String(fd.get("validUntil") ?? "").trim();
    const activeEl = form.elements.namedItem("active");
    const active = activeEl instanceof HTMLInputElement ? activeEl.checked : true;
    const body = {
      code,
      discountKind,
      discountValue,
      maxUses,
      validFrom: validFromLocal ? new Date(validFromLocal).toISOString() : null,
      validUntil: validUntilLocal ? new Date(validUntilLocal).toISOString() : null,
      active,
    };
    setErrMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      await apiFetch("/api/admin/promo-codes", { method: "POST", body: JSON.stringify(body) });
      form.reset();
      setModal({ type: "none" });
      setInfoMsg("Промокод создан.");
      await loadPromos();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onPatchPromo(e: React.FormEvent<HTMLFormElement>, promoId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const code = String(fd.get("code") ?? "").trim();
    const discountKind = String(fd.get("discountKind") ?? "PERCENT") as "PERCENT" | "FIXED_CENTS";
    let discountValue: number;
    if (discountKind === "PERCENT") {
      discountValue = Number.parseInt(String(fd.get("discountPercent") ?? ""), 10);
    } else {
      discountValue = parseMajorUnitsToMinor(String(fd.get("discountFixedMajor") ?? "0"));
    }
    const maxUsesRaw = String(fd.get("maxUses") ?? "").trim();
    const maxUses =
      maxUsesRaw === "" || !Number.isFinite(Number.parseInt(maxUsesRaw, 10)) ?
        null
      : Number.parseInt(maxUsesRaw, 10);
    const validFromLocal = String(fd.get("validFrom") ?? "").trim();
    const validUntilLocal = String(fd.get("validUntil") ?? "").trim();
    const activeEl = form.elements.namedItem("active");
    const active = activeEl instanceof HTMLInputElement ? activeEl.checked : true;
    const patch = {
      code,
      discountKind,
      discountValue,
      maxUses,
      validFrom: validFromLocal ? new Date(validFromLocal).toISOString() : null,
      validUntil: validUntilLocal ? new Date(validUntilLocal).toISOString() : null,
      active,
    };
    setErrMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      await apiFetch(`/api/admin/promo-codes/${encodeURIComponent(promoId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setModal({ type: "none" });
      setInfoMsg("Промокод сохранён.");
      await loadPromos();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onNewSlot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const title = String(fd.get("title") || "");
    const startsLocal = String(fd.get("startsAt") || "");
    const capRaw = String(fd.get("capacity") || "").trim();
    const currency = String(fd.get("currency") || "BYN").trim() || "BYN";
    const pa =
      parseOptionalMajorUnitsToMinor(String(fd.get("priceAdultCents") ?? "")) ??
      parseMajorUnitsToMinor("58");
    const pc =
      parseOptionalMajorUnitsToMinor(String(fd.get("priceChildCents") ?? "")) ??
      parseMajorUnitsToMinor("30");
    const pco =
      parseOptionalMajorUnitsToMinor(String(fd.get("priceConcessionCents") ?? "")) ??
      parseMajorUnitsToMinor("30");
    const priceCents = pa;
    if (!startsLocal) return;
    const startsAt = new Date(startsLocal).toISOString();
    const body: Record<string, unknown> = {
      title,
      startsAt,
      priceCents,
      currency,
      priceAdultCents: pa,
      priceChildCents: pc,
      priceConcessionCents: pco,
    };
    if (capRaw) body.capacity = Number.parseInt(capRaw, 10);
    setErrMsg("");
    setLoading(true);
    try {
      await apiFetch("/api/admin/slots", { method: "POST", body: JSON.stringify(body) });
      form.reset();
      setModal({ type: "none" });
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

  async function deleteSlot(id: string) {
    if (!window.confirm("Удалить этот сеанс? Доступно только если нет ни одного заказа.")) {
      return;
    }
    setErrMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      await apiFetch(`/api/admin/slots/${encodeURIComponent(id)}`, { method: "DELETE" });
      await loadSlots();
      setModal((m) => (m.type === "slot-edit" && m.slot.id === id ? { type: "none" } : m));
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function onBulkDay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!slotsData) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    const firstHour = Number.parseInt(String(fd.get("bulkFirstHour") ?? "10"), 10);
    const lastHour = Number.parseInt(String(fd.get("bulkLastHour") ?? "19"), 10);
    const title = String(fd.get("bulkTitle") ?? "").trim();
    const currency = String(fd.get("bulkCurrency") ?? "BYN").trim() || "BYN";
    const capRaw = String(fd.get("bulkCapacity") ?? "").trim();
    const skipExisting = (fd.get("bulkSkipExisting") as string | null) === "on";
    const pa =
      parseOptionalMajorUnitsToMinor(String(fd.get("bulkPriceAdultCents") ?? "")) ??
      parseMajorUnitsToMinor("58");
    const pc =
      parseOptionalMajorUnitsToMinor(String(fd.get("bulkPriceChildCents") ?? "")) ??
      parseMajorUnitsToMinor("30");
    const pco =
      parseOptionalMajorUnitsToMinor(String(fd.get("bulkPriceConcessionCents") ?? "")) ??
      parseMajorUnitsToMinor("30");
    const priceCents = pa;

    if (!title) {
      setErrMsg("Укажите название сеанса.");
      return;
    }
    if (
      !Number.isFinite(firstHour) ||
      !Number.isFinite(lastHour) ||
      firstHour < 0 ||
      firstHour > 23 ||
      lastHour < 0 ||
      lastHour > 23 ||
      firstHour > lastHour
    ) {
      setErrMsg("Проверьте часы: с и по (0–23), с ≤ по.");
      return;
    }

    const body: Record<string, unknown> = {
      date: selectedDate,
      firstHour,
      lastHour,
      title,
      priceCents: priceCents >= 0 ? priceCents : 0,
      currency,
      skipExisting,
    };
    if (capRaw) body.capacity = Number.parseInt(capRaw, 10);
    body.priceAdultCents = pa;
    body.priceChildCents = pc;
    body.priceConcessionCents = pco;

    setErrMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      const res = await apiFetch<{ created: number; skipped: number }>(
        "/api/admin/slots/bulk-day",
        { method: "POST", body: JSON.stringify(body) },
      );
      setInfoMsg(
        `Создано сеансов: ${res.created}. Пропущено (уже были на это время): ${res.skipped}. Часовой пояс: ${slotsData.timezone}.`,
      );
      setModal({ type: "none" });
      form.reset();
      await loadSlots();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSlotFromForm(e: React.FormEvent<HTMLFormElement>, slotId: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const slot = slotsData?.slots.find((x) => x.id === slotId);
    const title = String(fd.get("title") ?? "");
    const timePart = String(fd.get("slotTime") ?? "");
    const dateFromForm = String(fd.get("slotDate") ?? "").trim();
    const datePart =
      dateFromForm || (slot ? (isoToDatetimeLocal(slot.startsAt).split("T")[0] ?? "") : "");
    const capRaw = String(fd.get("capacity") ?? "").trim();
    const activeEl = form.elements.namedItem("active");
    const active = activeEl instanceof HTMLInputElement ? activeEl.checked : true;
    const priceAdultCents = parseOptionalMajorUnitsToMinor(String(fd.get("priceAdultCents") ?? ""));
    const priceChildCents = parseOptionalMajorUnitsToMinor(String(fd.get("priceChildCents") ?? ""));
    const priceConcessionCents = parseOptionalMajorUnitsToMinor(
      String(fd.get("priceConcessionCents") ?? ""),
    );
    const priceCents = priceAdultCents ?? (slot ? (slot.priceAdultCents ?? slot.priceCents) : 0);
    setErrMsg("");
    setInfoMsg("");
    setLoading(true);
    try {
      const patch: Record<string, unknown> = {
        title: title.trim(),
        active,
        priceCents: priceCents >= 0 ? priceCents : 0,
        priceAdultCents,
        priceChildCents,
        priceConcessionCents,
      };
      if (datePart && timePart) {
        patch.startsAt = new Date(`${datePart}T${timePart}:00`).toISOString();
      }
      patch.capacity = capRaw === "" ? null : Number.parseInt(capRaw, 10);
      await apiFetch(`/api/admin/slots/${encodeURIComponent(slotId)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      await loadSlots();
      setInfoMsg("Сеанс сохранён.");
      setModal({ type: "none" });
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

  const filteredOrders = useMemo(
    () => activeOrders.filter((o) => orderMatchesFilters(o, orderPayFilter, orderVisitFilter)),
    [activeOrders, orderPayFilter, orderVisitFilter],
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
          <p className="admin-login-sub">Секрет из окружения сервера (ADMIN_API_SECRET)</p>
          <p className="admin-login-sub" style={{ marginTop: "0.35rem", fontSize: "0.85em", opacity: 0.85 }}>
            После успешного входа секрет сохраняется в этом браузере (localStorage).
          </p>
          {loginErr ? <div className="admin-alert admin-alert--err">{loginErr}</div> : null}
          <form onSubmit={onLogin}>
            <label htmlFor="admin-secret">Секрет</label>
            <input
              id="admin-secret"
              name="secret"
              type="password"
              autoComplete="current-password"
              required
              value={adminSecretInput}
              onChange={(ev) => setAdminSecretInput(ev.target.value)}
            />
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
      {infoMsg ? <div className="admin-alert admin-alert--ok">{infoMsg}</div> : null}

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
          Сеансы
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "promos"}
          onClick={() => setTab("promos")}
        >
          Промокоды
        </button>
      </div>

      {tab === "orders" ? (
        <section className="admin-panel admin-panel--tight" id="tab-orders" aria-label="Заявки">
          <div className="admin-panel-head admin-panel-head--tight">
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
                  Активных: {activeOrders.length} · показано: {filteredOrders.length} · в ответе API:{" "}
                  {ordersData.orders.length}
                </span>
              ) : null}
            </div>
            <div className="admin-order-filters">
              <label>
                Оплата
                <select
                  value={orderPayFilter}
                  onChange={(e) => setOrderPayFilter(e.target.value as OrderPayFilter)}
                  aria-label="Фильтр по оплате"
                >
                  <option value="all">Все активные (PAID + PENDING)</option>
                  <option value="paid">Только PAID</option>
                  <option value="pending">Только PENDING</option>
                </select>
              </label>
              <label>
                Проход по билету
                <select
                  value={orderVisitFilter}
                  onChange={(e) => setOrderVisitFilter(e.target.value as OrderVisitFilter)}
                  aria-label="Фильтр по проходу"
                  disabled={orderPayFilter === "pending"}
                  title={orderPayFilter === "pending" ? "У PENDING ещё нет погашенных билетов" : undefined}
                >
                  <option value="all">Все</option>
                  <option value="visited">Прошёл (все билеты отмечены)</option>
                  <option value="not_visited">Не прошёл (ни одного скана)</option>
                  <option value="partial">Частично</option>
                  <option value="not_full">Не прошёл полностью (0 или частично)</option>
                </select>
              </label>
            </div>
            <p className="admin-hint admin-hint--inline">Строка — кратко; полные данные по нажатию.</p>
          </div>
          {!ordersData ? (
            <div className="admin-empty admin-empty--compact">Загрузка…</div>
          ) : activeOrders.length === 0 ? (
            <div className="admin-empty admin-empty--compact">Нет активных заявок</div>
          ) : filteredOrders.length === 0 ? (
            <div className="admin-empty admin-empty--compact">Нет заявок по выбранным фильтрам</div>
          ) : (
            <div className="admin-order-list" role="list">
              {filteredOrders.map((o) => {
                const st = o.status.toLowerCase();
                const pillClass =
                  st === "paid" ? "paid"
                  : st === "pending" ? "pending"
                  : st === "failed" ? "failed"
                  : "cancelled";
                const visitPill = visitPillForOrder(o.visitState);
                const createdShort = o.createdAt.slice(0, 16).replace("T", " ");
                return (
                  <button
                    key={o.id}
                    type="button"
                    className="admin-order-row"
                    role="listitem"
                    onClick={() => setModal({ type: "order", order: o })}
                  >
                    <div className="admin-order-row__left">
                      <span className="mono admin-order-row__time">{createdShort}</span>
                      <div className="admin-order-row__pills">
                        <span className={`pill ${pillClass}`}>{o.status}</span>
                        {visitPill ? <span className={`pill ${visitPill.cls}`}>{visitPill.label}</span> : null}
                      </div>
                    </div>
                    <div className="admin-order-row__mid">
                      <span className="admin-order-row__name">{truncateText(o.customer.name, 28)}</span>
                      <span className="admin-order-row__email mono">{truncateText(o.customer.email, 36)}</span>
                    </div>
                    <div className="admin-order-row__sum mono">{formatMinorUnits(o.amountCents, o.currency)}</div>
                    <div className="admin-order-row__slot">
                      <span className="admin-order-row__slot-title">{truncateText(o.slot.title, 40)}</span>
                      <span className="admin-order-row__slot-time mono">
                        {o.slot.startsAt.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <span className="admin-order-row__chev" aria-hidden>
                      →
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === "schedule" ? (
        <section className="admin-panel admin-panel--tight" id="tab-schedule" aria-label="Сеансы по дате">
          <div className="admin-panel-head admin-panel-head--stack admin-panel-head--tight">
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
            <div className="admin-schedule-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "slot-single" })}>
                + Один сеанс
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModal({ type: "slot-bulk" })}
                disabled={!slotsData}
              >
                + Группа на день
              </button>
            </div>
            <p className="admin-hint admin-hint--inline">Сеанс — строка; изменения и удаление в окне.</p>
          </div>
          {!slotsData ? (
            <div className="admin-empty admin-empty--compact">Загрузка…</div>
          ) : (
            <>
              {slotsForSelectedDate.length === 0 ? (
                <div className="admin-empty admin-empty--compact">На эту дату сеансов нет</div>
              ) : (
                <div className="admin-slot-list" role="list">
                  {slotsForSelectedDate.map((s) => {
                    const cap = s.capacity == null ? "∞" : String(s.capacity);
                    const free =
                      s.capacity == null ?
                        "—"
                      : String(Math.max(0, s.capacity - s.soldPaid - s.pendingReserved));
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className="admin-slot-row"
                        role="listitem"
                        onClick={() => setModal({ type: "slot-edit", slot: s })}
                      >
                        <div className="admin-slot-row__time mono">{s.timeKey}</div>
                        <div className="admin-slot-row__main">
                          <span className="admin-slot-row__title">{truncateText(s.title, 48)}</span>
                          <span className="admin-slot-row__meta mono">
                            {formatMinorUnits(s.priceCents, s.currency)} · опл. {s.soldPaid} · ожид.{" "}
                            {s.pendingReserved} · места {free}/{cap}
                          </span>
                        </div>
                        <span className={`pill ${s.active ? "slot-on" : "slot-off"}`}>
                          {s.active ? "активен" : "выкл"}
                        </span>
                        <span className="admin-order-row__chev" aria-hidden>
                          →
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {tab === "promos" ? (
        <section className="admin-panel admin-panel--tight" id="tab-promos" aria-label="Промокоды">
          <div className="admin-panel-head admin-panel-head--tight">
            <div className="admin-toolbar-row">
              <button
                type="button"
                className={`btn btn-secondary ${loading ? "is-loading" : ""}`}
                onClick={() => void loadPromos()}
                disabled={loading}
              >
                Обновить
              </button>
              <button type="button" className="btn" onClick={() => setModal({ type: "promo-new" })}>
                + Промокод
              </button>
            </div>
            <p className="admin-hint admin-hint--inline">
              Код на сайте / в POST <span className="mono">promoCode</span> или в ссылке /pay?promo=КОД.
              Занято: заявки PENDING+PAID с этим промо.
            </p>
          </div>
          {!promosData ? (
            <div className="admin-empty admin-empty--compact">Загрузка…</div>
          ) : promosData.length === 0 ? (
            <div className="admin-empty admin-empty--compact">Промокодов пока нет</div>
          ) : (
            <div className="admin-order-list" role="list">
              {promosData.map((p) => {
                const uses =
                  p.maxUses != null ? `${p.reservedOrders} / ${p.maxUses}` : `${p.reservedOrders} / ∞`;
                const kindLabel =
                  p.discountKind === "PERCENT" ? `${p.discountValue}%` : formatMinorUnits(p.discountValue, "BYN");
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="admin-order-row"
                    role="listitem"
                    onClick={() => setModal({ type: "promo-edit", promo: p })}
                  >
                    <div className="admin-order-row__left">
                      <span className={`pill ${p.active ? "paid" : "cancelled"}`}>
                        {p.active ? "активен" : "выкл"}
                      </span>
                    </div>
                    <div className="admin-order-row__mid">
                      <span className="mono admin-order-row__name">{p.code}</span>
                      <span className="admin-order-row__email">скидка {kindLabel}</span>
                    </div>
                    <div className="admin-order-row__sum mono">{uses}</div>
                    <div className="admin-order-row__slot">
                      <span className="admin-order-row__slot-title">
                        {p.validFrom || p.validUntil ?
                          `${p.validFrom ? p.validFrom.slice(0, 10) : "…"} — ${p.validUntil ? p.validUntil.slice(0, 10) : "…"}`
                        : "без срока"}
                      </span>
                    </div>
                    <span className="admin-order-row__chev" aria-hidden>
                      →
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {modal.type === "order" ? (
        <AdminModalFrame title="Заявка" onClose={() => setModal({ type: "none" })}>
          {(() => {
            const o = modal.order;
            const st = o.status.toLowerCase();
            const pillClass =
              st === "paid" ? "paid"
              : st === "pending" ? "pending"
              : st === "failed" ? "failed"
              : "cancelled";
            const visitP = visitPillForOrder(o.visitState);
            return (
              <div className="admin-detail">
                <div className="admin-detail__row">
                  <span className="admin-detail__k">Статус</span>
                  <span className="admin-order-row__pills">
                    <span className={`pill ${pillClass}`}>{o.status}</span>
                    {visitP ? <span className={`pill ${visitP.cls}`}>{visitP.label}</span> : null}
                  </span>
                </div>
                {o.status.toUpperCase() === "PAID" ? (
                  <div className="admin-detail__row">
                    <span className="admin-detail__k">Проход</span>
                    <div className="admin-detail__block">
                      {o.visitState === "visited" && o.visitedAt ? (
                        <div className="mono">Все билеты отмечены · {o.visitedAt}</div>
                      ) : o.visitState === "partial" ? (
                        <div>
                          <span className="admin-muted-text">Отмечены не все билеты.</span>
                          {o.tickets.some((t) => t.usedAt) ? (
                            <div className="mono admin-muted-text" style={{ marginTop: "0.25rem" }}>
                              Последняя отметка:{" "}
                              {(() => {
                                const times = o.tickets.map((t) => t.usedAt).filter(Boolean) as string[];
                                return times.length ? times.sort().at(-1) : "—";
                              })()}
                            </div>
                          ) : null}
                        </div>
                      ) : o.visitState === "not_visited" ? (
                        <span className="admin-muted-text">По билетам проход ещё не отмечен.</span>
                      ) : (
                        <span className="admin-muted-text">Нет билетов в заказе.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="admin-detail__row">
                    <span className="admin-detail__k">Проход</span>
                    <span className="admin-muted-text">доступен после оплаты (PAID)</span>
                  </div>
                )}
                {o.status.toUpperCase() === "PAID" && o.tickets.length > 0 ? (
                  <div className="admin-detail__row admin-detail__row--block">
                    <span className="admin-detail__k">Билеты</span>
                    <ul className="admin-detail-lines">
                      {o.tickets.map((t, i) => {
                        const prefix = o.tickets.length > 1 ? `#${i + 1} · ` : "";
                        const tierPart = t.tier
                          ? `${tierTicketSingularRu(t.tier)} · `
                          : "тип не указан · ";
                        const scanPart = t.usedAt ? `отмечен ${t.usedAt}` : "не отмечен";
                        const cntPart = t.admissionCount > 1 ? ` · входов ×${t.admissionCount}` : "";
                        return (
                          <li key={t.id}>
                            <span className={`mono${t.tier ? "" : " admin-muted-text"}`}>
                              {prefix}
                              {tierPart}
                              {scanPart}
                              {cntPart}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                <div className="admin-detail__row">
                  <span className="admin-detail__k">Сумма</span>
                  <span className="mono">{formatMinorUnits(o.amountCents, o.currency)}</span>
                </div>
                {o.discountCents > 0 ? (
                  <>
                    <div className="admin-detail__row">
                      <span className="admin-detail__k">До скидки</span>
                      <span className="mono">{formatMinorUnits(o.subtotalCents, o.currency)}</span>
                    </div>
                    <div className="admin-detail__row">
                      <span className="admin-detail__k">Скидка</span>
                      <span className="mono">−{formatMinorUnits(o.discountCents, o.currency)}</span>
                    </div>
                  </>
                ) : null}
                {o.promoCode ? (
                  <div className="admin-detail__row">
                    <span className="admin-detail__k">Промокод</span>
                    <span className="mono">{o.promoCode}</span>
                  </div>
                ) : null}
                <div className="admin-detail__row">
                  <span className="admin-detail__k">Создан</span>
                  <span className="mono">{o.createdAt}</span>
                </div>
                <div className="admin-detail__row">
                  <span className="admin-detail__k">Оплачен</span>
                  <span className="mono">{o.paidAt ?? "—"}</span>
                </div>
                <div className="admin-detail__row admin-detail__row--block">
                  <span className="admin-detail__k">Заказ</span>
                  <code className="admin-detail__code">{o.id}</code>
                </div>
                <div className="admin-detail__row admin-detail__row--block">
                  <span className="admin-detail__k">Клиент</span>
                  <div className="admin-detail__block">
                    <div>{o.customer.name}</div>
                    <div className="mono">{o.customer.email}</div>
                    <div className="mono">{o.customer.phone}</div>
                  </div>
                </div>
                <div className="admin-detail__row admin-detail__row--block">
                  <span className="admin-detail__k">Сеанс</span>
                  <div className="admin-detail__block">
                    <div>{o.slot.title}</div>
                    <div className="mono">{o.slot.startsAt}</div>
                    <div className="mono admin-muted-text">slotId: {o.slot.id}</div>
                  </div>
                </div>
                <div className="admin-detail__row admin-detail__row--block">
                  <span className="admin-detail__k">Состав</span>
                  <ul className="admin-detail-lines">
                    {o.lines.map((l, i) => (
                      <li key={i}>
                        <span className="mono">{tierRu(l.tier)}</span> ×{l.quantity} ·{" "}
                        {formatMinorUnits(l.unitPriceCents, o.currency)} за ед.
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="admin-modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                    Закрыть
                  </button>
                </div>
              </div>
            );
          })()}
        </AdminModalFrame>
      ) : null}

      {modal.type === "promo-new" ? (
        <AdminModalFrame title="Новый промокод" onClose={() => setModal({ type: "none" })}>
          <form onSubmit={(e) => void onCreatePromo(e)} className="admin-modal-form">
            <p className="admin-hint admin-hint--tight">
              Код сохраняется в верхнем регистре. Фиксированная скидка — в BYN (как цены сеансов).
            </p>
            <div className="admin-field">
              <label htmlFor="promo-code">Код</label>
              <input id="promo-code" name="code" required maxLength={40} placeholder="SUMMER2026" />
            </div>
            <div className="admin-field">
              <label htmlFor="promo-kind">Тип скидки</label>
              <select id="promo-kind" name="discountKind" defaultValue="PERCENT">
                <option value="PERCENT">Процент от суммы</option>
                <option value="FIXED_CENTS">Фиксированная сумма (BYN)</option>
              </select>
            </div>
            <div className="admin-row admin-row--modal">
              <div className="admin-field admin-field-narrow">
                <label htmlFor="promo-pct">Процент (1–100)</label>
                <input id="promo-pct" name="discountPercent" type="number" min={1} max={100} defaultValue={10} />
              </div>
              <div className="admin-field admin-field-narrow">
                <label htmlFor="promo-fix">Скидка BYN (если тип «фикс»)</label>
                <input
                  id="promo-fix"
                  name="discountFixedMajor"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={5}
                />
              </div>
            </div>
            <div className="admin-field admin-field-narrow">
              <label htmlFor="promo-max">Лимит активаций (пусто = без лимита)</label>
              <input id="promo-max" name="maxUses" type="number" min={1} placeholder="∞" />
            </div>
            <div className="admin-row admin-row--modal">
              <div className="admin-field">
                <label htmlFor="promo-vf">Действует с (локально)</label>
                <input id="promo-vf" name="validFrom" type="datetime-local" />
              </div>
              <div className="admin-field">
                <label htmlFor="promo-vu">Действует до</label>
                <input id="promo-vu" name="validUntil" type="datetime-local" />
              </div>
            </div>
            <label className="admin-check admin-check--modal">
              <input type="checkbox" name="active" defaultChecked />
              Активен
            </label>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                Отмена
              </button>
              <button type="submit" className="btn" disabled={loading}>
                Создать
              </button>
            </div>
          </form>
        </AdminModalFrame>
      ) : null}

      {modal.type === "promo-edit" ? (
        <AdminModalFrame title="Промокод" onClose={() => setModal({ type: "none" })}>
          {(() => {
            const p = modal.promo;
            return (
              <form
                key={p.id}
                onSubmit={(e) => void onPatchPromo(e, p.id)}
                className="admin-modal-form"
              >
                <p className="admin-hint admin-hint--tight mono">id: {p.id}</p>
                <div className="admin-field">
                  <label htmlFor="edit-promo-code">Код</label>
                  <input id="edit-promo-code" name="code" required maxLength={40} defaultValue={p.code} />
                </div>
                <div className="admin-field">
                  <label htmlFor="edit-promo-kind">Тип скидки</label>
                  <select
                    id="edit-promo-kind"
                    name="discountKind"
                    defaultValue={p.discountKind}
                  >
                    <option value="PERCENT">Процент от суммы</option>
                    <option value="FIXED_CENTS">Фиксированная сумма (BYN)</option>
                  </select>
                </div>
                <div className="admin-row admin-row--modal">
                  <div className="admin-field admin-field-narrow">
                    <label htmlFor="edit-promo-pct">Процент (1–100)</label>
                    <input
                      id="edit-promo-pct"
                      name="discountPercent"
                      type="number"
                      min={1}
                      max={100}
                      defaultValue={p.discountKind === "PERCENT" ? p.discountValue : 10}
                    />
                  </div>
                  <div className="admin-field admin-field-narrow">
                    <label htmlFor="edit-promo-fix">Скидка BYN (если тип «фикс»)</label>
                    <input
                      id="edit-promo-fix"
                      name="discountFixedMajor"
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={
                        p.discountKind === "FIXED_CENTS" ? minorToMajorNumber(p.discountValue) : 5
                      }
                    />
                  </div>
                </div>
                <div className="admin-field admin-field-narrow">
                  <label htmlFor="edit-promo-max">Лимит активаций (пусто = ∞)</label>
                  <input
                    id="edit-promo-max"
                    name="maxUses"
                    type="number"
                    min={1}
                    placeholder="∞"
                    defaultValue={p.maxUses ?? ""}
                  />
                </div>
                <div className="admin-row admin-row--modal">
                  <div className="admin-field">
                    <label htmlFor="edit-promo-vf">Действует с</label>
                    <input
                      id="edit-promo-vf"
                      name="validFrom"
                      type="datetime-local"
                      defaultValue={p.validFrom ? isoToDatetimeLocal(p.validFrom) : ""}
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="edit-promo-vu">Действует до</label>
                    <input
                      id="edit-promo-vu"
                      name="validUntil"
                      type="datetime-local"
                      defaultValue={p.validUntil ? isoToDatetimeLocal(p.validUntil) : ""}
                    />
                  </div>
                </div>
                <label className="admin-check admin-check--modal">
                  <input type="checkbox" name="active" defaultChecked={p.active} />
                  Активен
                </label>
                <p className="admin-hint admin-hint--tight">
                  Занято заявок (PENDING+PAID): <span className="mono">{p.reservedOrders}</span>
                </p>
                <div className="admin-modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                    Отмена
                  </button>
                  <button type="submit" className="btn" disabled={loading}>
                    Сохранить
                  </button>
                </div>
              </form>
            );
          })()}
        </AdminModalFrame>
      ) : null}

      {modal.type === "slot-single" ? (
        <AdminModalFrame title="Новый сеанс" onClose={() => setModal({ type: "none" })}>
          <form
            key={`slot-single-${selectedDate}`}
            onSubmit={(e) => void onNewSlot(e)}
            className="admin-modal-form"
          >
            <p className="admin-hint admin-hint--tight">
              Суммы в BYN как на сайте (58 = 58,00); в API уходят копейки. Базовая цена в БД = взрослый.
            </p>
            <div className="admin-row admin-row--modal">
              <div className="admin-field">
                <label>Название</label>
                <input name="title" required placeholder="Сеанс" />
              </div>
              <div className="admin-field">
                <label>Дата и время</label>
                <input
                  name="startsAt"
                  type="datetime-local"
                  required
                  defaultValue={`${selectedDate}T10:00`}
                />
              </div>
            </div>
            <div className="admin-row admin-row--modal">
              <div className="admin-field admin-field-narrow">
                <label>Лимит мест</label>
                <input name="capacity" type="number" min={1} defaultValue={1000} placeholder="∞" />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>Валюта</label>
                <input name="currency" defaultValue="BYN" maxLength={8} />
              </div>
            </div>
            <div className="admin-row admin-row--modal">
              <div className="admin-field admin-field-narrow">
                <label>Взрослый, BYN</label>
                <input name="priceAdultCents" type="number" min={0} step={0.01} defaultValue={58} />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>Детский, BYN</label>
                <input name="priceChildCents" type="number" min={0} step={0.01} defaultValue={30} />
              </div>
              <div className="admin-field admin-field-narrow">
                <label>Льготный, BYN</label>
                <input name="priceConcessionCents" type="number" min={0} step={0.01} defaultValue={30} />
              </div>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                Отмена
              </button>
              <button type="submit" className="btn" disabled={loading}>
                Создать
              </button>
            </div>
          </form>
        </AdminModalFrame>
      ) : null}

      {modal.type === "slot-edit" && slotsData ? (
        <AdminModalFrame
          size="wide"
          title="Редактирование сеанса"
          onClose={() => setModal({ type: "none" })}
        >
          {(() => {
            const s = modal.slot;
            return (
              <form
                key={`slot-edit-${s.id}`}
                className="admin-modal-form"
                onSubmit={(e) => void saveSlotFromForm(e, s.id)}
              >
                <p className="admin-hint admin-hint--tight mono">id: {s.id}</p>
                <p className="admin-hint admin-hint--tight">Часовой пояс: {slotsData.timezone}</p>
                <div className="admin-row admin-row--modal">
                  <div className="admin-field admin-field-narrow">
                    <label htmlFor="edit-slot-date">Дата</label>
                    <input
                      id="edit-slot-date"
                      name="slotDate"
                      type="date"
                      required
                      defaultValue={s.dateKey}
                    />
                  </div>
                  <div className="admin-field admin-field-narrow">
                    <label htmlFor="edit-slot-time">Время</label>
                    <input
                      id="edit-slot-time"
                      name="slotTime"
                      type="time"
                      step={60}
                      required
                      defaultValue={isoToTimeLocalHHmm(s.startsAt)}
                    />
                  </div>
                  <div className="admin-field">
                    <label htmlFor="edit-slot-title">Название</label>
                    <input id="edit-slot-title" name="title" required defaultValue={s.title} />
                  </div>
                </div>
                <div className="admin-field admin-field--full">
                  <label>Цены, BYN</label>
                  <div className="price-grid price-grid--modal">
                    <span className="admin-muted-text">Взр.</span>
                    <input
                      name="priceAdultCents"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="—"
                      defaultValue={
                        s.priceAdultCents != null ? minorToMajorNumber(s.priceAdultCents) : ""
                      }
                    />
                    <span className="admin-muted-text">Дет.</span>
                    <input
                      name="priceChildCents"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="—"
                      defaultValue={
                        s.priceChildCents != null ? minorToMajorNumber(s.priceChildCents) : ""
                      }
                    />
                    <span className="admin-muted-text">Льг.</span>
                    <input
                      name="priceConcessionCents"
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="—"
                      defaultValue={
                        s.priceConcessionCents != null ?
                          minorToMajorNumber(s.priceConcessionCents)
                        : ""
                      }
                    />
                  </div>
                </div>
                <div className="admin-row admin-row--modal">
                  <div className="admin-field admin-field-narrow">
                    <label htmlFor="edit-slot-cap">Лимит мест</label>
                    <input
                      id="edit-slot-cap"
                      name="capacity"
                      type="number"
                      min={1}
                      placeholder="∞"
                      defaultValue={s.capacity ?? ""}
                    />
                  </div>
                  <div className="admin-field admin-field--grow admin-field--check">
                    <label className="admin-check admin-check--modal">
                      <input type="checkbox" name="active" defaultChecked={s.active} />
                      Сеанс активен (виден на сайте)
                    </label>
                  </div>
                </div>
                <div className="admin-modal-actions admin-modal-actions--split">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={loading}
                    onClick={() => void deleteSlot(s.id)}
                  >
                    Удалить
                  </button>
                  <div className="admin-modal-actions__end">
                    <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                      Отмена
                    </button>
                    <button type="submit" className="btn" disabled={loading}>
                      Сохранить
                    </button>
                  </div>
                </div>
              </form>
            );
          })()}
        </AdminModalFrame>
      ) : null}

      {modal.type === "slot-bulk" && slotsData ? (
        <AdminModalFrame title="Группа сеансов на день" onClose={() => setModal({ type: "none" })}>
          <form key={`bulk-${selectedDate}`} onSubmit={(e) => void onBulkDay(e)} className="admin-modal-form">
            <p className="admin-hint admin-hint--tight">
              Дата: <span className="mono">{selectedDate}</span> ({slotsData.timezone}). Один слот на каждый час от
              «с» до «по» включительно. Цены — в BYN.
            </p>
            <div className="admin-row admin-row--modal">
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-first-hour">С часа</label>
                <input
                  id="bulk-first-hour"
                  name="bulkFirstHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={10}
                  required
                />
              </div>
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-last-hour">По час</label>
                <input
                  id="bulk-last-hour"
                  name="bulkLastHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={19}
                  required
                />
              </div>
              <div className="admin-field">
                <label htmlFor="bulk-title">Название</label>
                <input id="bulk-title" name="bulkTitle" required placeholder="Экскурсия" />
              </div>
            </div>
            <div className="admin-row admin-row--modal">
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-cap">Лимит мест</label>
                <input
                  id="bulk-cap"
                  name="bulkCapacity"
                  type="number"
                  min={1}
                  defaultValue={1000}
                  placeholder="∞"
                />
              </div>
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-cur">Валюта</label>
                <input id="bulk-cur" name="bulkCurrency" defaultValue="BYN" maxLength={8} />
              </div>
            </div>
            <div className="admin-row admin-row--modal">
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-pa">Взрослый, BYN</label>
                <input
                  id="bulk-pa"
                  name="bulkPriceAdultCents"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={58}
                />
              </div>
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-pc">Детский, BYN</label>
                <input
                  id="bulk-pc"
                  name="bulkPriceChildCents"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={30}
                />
              </div>
              <div className="admin-field admin-field-narrow">
                <label htmlFor="bulk-pco">Льготный, BYN</label>
                <input
                  id="bulk-pco"
                  name="bulkPriceConcessionCents"
                  type="number"
                  min={0}
                  step={0.01}
                  defaultValue={30}
                />
              </div>
            </div>
            <label className="admin-check admin-check--modal">
              <input type="checkbox" name="bulkSkipExisting" defaultChecked />
              Не создавать, если на это время уже есть сеанс
            </label>
            <div className="admin-modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setModal({ type: "none" })}>
                Отмена
              </button>
              <button type="submit" className="btn" disabled={loading}>
                Создать слоты
              </button>
            </div>
          </form>
        </AdminModalFrame>
      ) : null}
    </div>
  );
}
