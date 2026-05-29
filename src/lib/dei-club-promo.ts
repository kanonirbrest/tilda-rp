import { DateTime } from "luxon";
import { EXHIBITION_TIMEZONE_DEFAULT, getExhibitionTimezone } from "@/lib/exhibition-time";
import { normalizePromoCode } from "@/lib/promo-code";

const NR_PROMO_RE = /^NR-[A-Z0-9]{8}$/;

export type DeiClubRedeemOk = {
  ok: true;
  code: string;
  discountPercent: number;
  userId: number;
};

export type DeiClubRedeemErr = {
  ok: false;
  error: string;
  hint: string;
  status: number;
};

/** Код из Telegram-бота DEI (rp_bot): NR- + 8 символов A–Z, 0–9. */
export function isDeiClubNrPromoCode(raw: string): boolean {
  return NR_PROMO_RE.test(normalizePromoCode(raw));
}

/** Пользователь ввёл NR-… — обрабатываем через API бота, не через локальную таблицу PromoCode. */
export function isDeiClubNrPromoAttempt(raw: string): boolean {
  return normalizePromoCode(raw).startsWith("NR-");
}

export function getDeiClubPromoDiscountPercent(): number {
  const raw = process.env.PROMO_DISCOUNT_PERCENT?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 10;
  if (!Number.isFinite(n) || n < 1 || n > 100) return 10;
  return n;
}

/** Конец акции включительно (Europe/Minsk), по умолчанию 01.07.2026. */
export function isDeiClubCampaignExpired(now = new Date()): boolean {
  const raw = process.env.PROMO_CAMPAIGN_VALID_UNTIL?.trim() || "01.07.2026";
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return false;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const tz = getExhibitionTimezone() || EXHIBITION_TIMEZONE_DEFAULT;
  const end = DateTime.fromObject(
    { year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 },
    { zone: tz },
  );
  if (!end.isValid) return false;
  return DateTime.fromJSDate(now, { zone: tz }) > end;
}

export function computeDeiClubPromoAmounts(
  subtotalCents: number,
  percent = getDeiClubPromoDiscountPercent(),
): { discountCents: number; amountCents: number } {
  if (subtotalCents <= 0) return { discountCents: 0, amountCents: 0 };
  const discountCents = Math.floor((subtotalCents * percent) / 100);
  const amountCents = Math.max(0, subtotalCents - discountCents);
  return { discountCents, amountCents };
}

function promoApiConfigured(): boolean {
  const url = process.env.PROMO_API_URL?.trim();
  const secret = process.env.PROMO_API_SECRET?.trim();
  return Boolean(url && secret);
}

function hintForRedeemError(error: string, status: number): string {
  switch (error) {
    case "invalid_format":
      return "Неверный формат промокода";
    case "invalid_json":
      return "Не удалось применить промокод клуба DEI";
    case "unauthorized":
      return "Промокоды клуба временно недоступны";
    case "not_found":
      return "Промокод не найден";
    case "already_used":
      return "Промокод уже использован";
    case "campaign_expired":
      return "Срок действия акции истёк";
    case "internal_error":
      return "Не удалось применить промокод. Попробуйте позже.";
    default:
      if (status === 401) return "Промокоды клуба временно недоступны";
      if (status >= 500) return "Не удалось применить промокод. Попробуйте позже.";
      return "Не удалось применить промокод клуба DEI";
  }
}

/**
 * Погашение NR-* через POST /api/promo/redeem (rp_bot).
 * Вызывать только при создании заказа, не при превью суммы.
 */
export async function redeemDeiClubPromoCode(raw: string): Promise<DeiClubRedeemOk | DeiClubRedeemErr> {
  const code = normalizePromoCode(raw);

  if (!isDeiClubNrPromoCode(code)) {
    return {
      ok: false,
      error: "invalid_format",
      hint: hintForRedeemError("invalid_format", 400),
      status: 400,
    };
  }

  if (isDeiClubCampaignExpired()) {
    return {
      ok: false,
      error: "campaign_expired",
      hint: hintForRedeemError("campaign_expired", 410),
      status: 410,
    };
  }

  if (!promoApiConfigured()) {
    console.error("[dei-club-promo] PROMO_API_URL или PROMO_API_SECRET не заданы");
    return {
      ok: false,
      error: "service_unavailable",
      hint: "Промокоды клуба DEI временно недоступны",
      status: 503,
    };
  }

  const base = process.env.PROMO_API_URL!.trim().replace(/\/$/, "");
  const timeoutMs = 10_000;

  try {
    const res = await fetch(`${base}/api/promo/redeem`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PROMO_API_SECRET!.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    let body: {
      ok?: boolean;
      code?: string;
      discount_percent?: number;
      user_id?: number;
      error?: string;
    } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      body = {};
    }

    if (res.ok && body.ok) {
      const userId = Number(body.user_id);
      if (!Number.isFinite(userId)) {
        console.error("[dei-club-promo] redeem ok без user_id", { code });
        return {
          ok: false,
          error: "bad_response",
          hint: "Не удалось применить промокод клуба DEI",
          status: 502,
        };
      }
      return {
        ok: true,
        code: body.code ? normalizePromoCode(body.code) : code,
        discountPercent: Number(body.discount_percent) || getDeiClubPromoDiscountPercent(),
        userId,
      };
    }

    const errKey = String(body.error || "").trim() || "redeem_failed";
    return {
      ok: false,
      error: errKey,
      hint: hintForRedeemError(errKey, res.status),
      status: res.status >= 400 && res.status < 600 ? res.status : 502,
    };
  } catch (err) {
    console.error("[dei-club-promo] redeem network", {
      code,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: "network",
      hint: "Не удалось связаться с сервисом промокодов. Попробуйте позже.",
      status: 502,
    };
  }
}

/** Превью скидки для order-quote (без вызова redeem). */
export function previewDeiClubPromo(
  raw: string,
  subtotalCents: number,
): { applied: true; discountCents: number; amountCents: number; hint: string } | { applied: false; error: string; hint: string } {
  const code = normalizePromoCode(raw);

  if (!isDeiClubNrPromoCode(code)) {
    return {
      applied: false,
      error: "INVALID_PROMO",
      hint: "Неверный формат промокода клуба DEI (NR-XXXXXXXX)",
    };
  }

  if (isDeiClubCampaignExpired()) {
    return {
      applied: false,
      error: "PROMO_INACTIVE",
      hint: "Срок действия акции истёк",
    };
  }

  if (!promoApiConfigured()) {
    return {
      applied: false,
      error: "PROMO_UNAVAILABLE",
      hint: "Промокоды клуба DEI временно недоступны",
    };
  }

  const { discountCents, amountCents } = computeDeiClubPromoAmounts(subtotalCents);
  if (amountCents < 1) {
    return {
      applied: false,
      error: "PROMO_ZERO_PAYMENT",
      hint: "После скидки сумма слишком мала для онлайн-оплаты",
    };
  }

  const pct = getDeiClubPromoDiscountPercent();
  return {
    applied: true,
    discountCents,
    amountCents,
    hint: `Скидка клуба DEI ${pct}%. Промокод будет применён при оплате.`,
  };
}
