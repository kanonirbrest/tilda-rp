import { normalizeTimeInput } from "@/lib/exhibition-time";
import {
  BELYE_NOCHI_18_SLOT_KIND,
  GARDENS_OF_DREAMS_SLOT_KIND,
  NEBO_REKA_SLOT_KIND,
  NIGHT_OF_MUSEUMS_SLOT_KIND,
  VIVALDI_CONCERT_SLOT_KIND,
} from "@/lib/slot-kind";

/** Страница витрины уже привязана к одному показу. */
const GARDENS_PAGE: Record<string, string> = {
  "2026-07-06 20:00": "/sady-snovideniy",
  "2026-07-19 17:00": "/sady-snovideniy-19-07",
  "2026-07-19 20:30": "/sady-snovideniy-19-07-2030",
  "2026-07-20 20:00": "/sady-snovideniy-20-07",
  "2026-08-17 20:00": "/sady-snovideniy-17-08",
  "2026-08-18 20:00": "/sady-snovideniy-18-08",
  "2026-09-07 20:00": "/sady-snovideniy-07-09",
  "2026-09-08 20:00": "/sady-snovideniy-08-09",
  "2026-10-20 20:00": "/sady-snovideniy-20-10",
  "2026-11-07 21:00": "/sady-snovideniy-07-11",
};

const VIVALDI_PAGE: Record<string, string> = {
  "2026-10-13": "/koncert-vivaldi",
  "2026-10-26": "/koncert-vivaldi/26-10",
};

export type StorefrontOrder = {
  slotKind?: string;
  giftOpenDate?: boolean;
  date?: string;
  time?: string;
  adult?: number;
  child?: number;
  concession?: number;
};

function withCounts(path: string, order: StorefrontOrder, extra?: Record<string, string>): string {
  const q = new URLSearchParams(extra);
  if (order.adult) q.set("adult", String(order.adult));
  if (order.child) q.set("child", String(order.child));
  if (order.concession) q.set("concession", String(order.concession));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** Та же ссылка плюс флаг, чтобы витрина показала «оплата не прошла». */
export function paymentRetryHref(order: StorefrontOrder): string | null {
  const href = storefrontRetryHref(order);
  if (!href) return null;
  return `${href}${href.includes("?") ? "&" : "?"}retry=1`;
}

export function paymentRetryFromLocation(): boolean {
  return new URLSearchParams(window.location.search).get("retry") === "1";
}

/** Куда вернуть покупателя после неудачной оплаты — на витрину этого заказа. */
export function storefrontRetryHref(order: StorefrontOrder): string | null {
  const kind = order.slotKind;
  if (kind === NEBO_REKA_SLOT_KIND) {
    if (order.giftOpenDate) return withCounts("/buy-tickets-smr", order, { gift: "1" });
    if (!order.date || !order.time) return null;
    return withCounts("/buy-tickets-smr", order, { date: order.date, time: order.time });
  }
  if (kind === NIGHT_OF_MUSEUMS_SLOT_KIND || kind === BELYE_NOCHI_18_SLOT_KIND) {
    if (!order.date || !order.time) return null;
    const path = kind === NIGHT_OF_MUSEUMS_SLOT_KIND ? "/nightofmuseums" : "/belye-nochi-18";
    return withCounts(path, order, { date: order.date, time: order.time });
  }
  if (kind === GARDENS_OF_DREAMS_SLOT_KIND) {
    if (!order.date || !order.time) return null;
    return GARDENS_PAGE[`${order.date} ${order.time}`] ?? null;
  }
  if (kind === VIVALDI_CONCERT_SLOT_KIND) {
    if (!order.date) return null;
    return VIVALDI_PAGE[order.date] ?? null;
  }
  return null;
}

/** date и time из адреса возврата. Нет параметров — обычное открытие витрины. */
export function slotFromLocation(): { date: string; time: string; adult: number | null } | null {
  const sp = new URLSearchParams(window.location.search);
  const date = sp.get("date")?.trim() ?? "";
  const time = normalizeTimeInput(sp.get("time") ?? "") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !time) return null;
  const adult = Number.parseInt(sp.get("adult") ?? "", 10);
  return { date, time, adult: Number.isFinite(adult) && adult > 0 && adult <= 30 ? adult : null };
}
