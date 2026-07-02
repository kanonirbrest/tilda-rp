import { promoCampaignValidUntilRaw } from "@/lib/promo-campaign";
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

/** Текст как в Telegram-боте при окончании акции персональных NR-кодов. */
export function personalNrPromoCampaignExpiredHint(): string {
  const until = promoCampaignValidUntilRaw();
  return (
    `Срок действия персональных промокодов на выставку «Небо.Река» истёк ` +
    `(акция была до ${until}).`
  );
}

/** @deprecated проверка срока NR-кодов — только в rp_bot (redeem), не на сайте */
export function isDeiClubCampaignExpired(): boolean {
  return false;
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

/** Базовый URL rp_bot без хвостового / и без лишнего /api. */
export function normalizePromoApiBase(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "");
  if (base.endsWith("/api")) {
    base = base.slice(0, -4);
  }
  return base;
}

function inferRedeemErrorKey(error: string, status: number): string {
  const normalized = error.trim().toLowerCase();
  if (normalized) return normalized;
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 409) return "already_used";
  if (status === 410) return "campaign_expired";
  if (status >= 500) return "internal_error";
  return "redeem_failed";
}

function hintForRedeemError(error: string, status: number): string {
  switch (error) {
    case "invalid_format":
      return "Неверный формат промокода";
    case "invalid_json":
      return "Сервис промокодов вернул некорректный ответ. Проверьте PROMO_API_URL на сервере.";
    case "unauthorized":
    case "forbidden":
      return "Промокоды клуба временно недоступны (ошибка авторизации сервиса)";
    case "not_found":
      return "Промокод не найден";
    case "already_used":
      return "Промокод уже использован";
    case "expired":
      return "Срок действия этого персонального промокода istёk";
    case "campaign_expired":
      return personalNrPromoCampaignExpiredHint();
    case "internal_error":
    case "service_unavailable":
    case "network":
      return "Не удалось применить промокод. Попробуйте позже.";
    case "bad_response":
      return "Сервис промокодов вернул неполный ответ. Обратитесь в поддержку.";
    case "redeem_failed":
      if (status === 401 || status === 403) {
        return "Промокоды клуба временно недоступны (ошибка авторизации сервиса)";
      }
      if (status === 404) {
        return "Промокод не найден или сервис промокодов настроен неверно";
      }
      if (status >= 500) return "Не удалось применить промокод. Попробуйте позже.";
      return "Не удалось применить промокод клуба DEI";
    default:
      if (status === 401 || status === 403) {
        return "Промокоды клуба временно недоступны (ошибка авторизации сервиса)";
      }
      if (status === 404) return "Промокод не найден";
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

  if (!promoApiConfigured()) {
    console.error("[dei-club-promo] PROMO_API_URL или PROMO_API_SECRET не заданы");
    return {
      ok: false,
      error: "service_unavailable",
      hint: "Промокоды клуба DEI временно недоступны",
      status: 503,
    };
  }

  const base = normalizePromoApiBase(process.env.PROMO_API_URL!);
  const timeoutMs = 10_000;
  const redeemUrl = `${base}/api/promo/redeem`;

  try {
    const res = await fetch(redeemUrl, {
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
      user_id?: number | string;
      error?: string;
    } = {};
    const rawText = await res.text();
    if (rawText.trim()) {
      try {
        body = JSON.parse(rawText) as typeof body;
      } catch {
        console.error("[dei-club-promo] redeem non-JSON", {
          code,
          status: res.status,
          url: redeemUrl,
          head: rawText.slice(0, 200),
        });
        return {
          ok: false,
          error: "invalid_json",
          hint: hintForRedeemError("invalid_json", res.status),
          status: res.status >= 400 && res.status < 600 ? res.status : 502,
        };
      }
    }

    if (res.ok && body.ok) {
      const userId = Number(body.user_id);
      if (!Number.isFinite(userId)) {
        console.error("[dei-club-promo] redeem ok без user_id", { code, url: redeemUrl, body });
        return {
          ok: false,
          error: "bad_response",
          hint: hintForRedeemError("bad_response", res.status),
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

    const errKey = inferRedeemErrorKey(String(body.error || ""), res.status);
    if (!res.ok) {
      console.error("[dei-club-promo] redeem failed", {
        code,
        status: res.status,
        url: redeemUrl,
        error: errKey,
        body,
      });
    }
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
    hint: `Скидка клуба DEI ${pct}%. Промокод будет погашён после успешной оплаты.`,
  };
}
