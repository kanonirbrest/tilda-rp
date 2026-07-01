import { Prisma } from "@prisma/client";
import { formatGardensOccupiedSeatsMessage } from "@/lib/gardens-of-dreams/seat-map";
import type { CreateOrderCheckoutErr } from "@/lib/create-order-checkout";
import { PromoApplyError } from "@/lib/promo-code";

export class SeatUnavailableError extends Error {
  readonly seatKeys: string[];

  constructor(seatKeys: string[]) {
    super("SEAT_UNAVAILABLE");
    this.name = "SeatUnavailableError";
    this.seatKeys = seatKeys;
  }
}

/** instanceof ломается в бандле Next.js — проверяем по полю code. */
function prismaErrorCode(e: unknown): string | undefined {
  if (typeof e !== "object" || e === null || !("code" in e)) return undefined;
  const code = (e as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** Текст ошибки checkout для ответа API (без технических деталей). */
export function checkoutResponseHint(result: {
  message: string;
  hint?: string;
  error?: string;
}): string {
  if (result.hint?.trim()) return result.hint.trim();
  if (result.message?.trim()) return result.message.trim();
  return "Не удалось оформить заказ. Попробуйте ещё раз.";
}

export function mapSeatCheckoutException(e: unknown): CreateOrderCheckoutErr {
  if (e instanceof SeatUnavailableError) {
    return {
      ok: false,
      status: 409,
      message: "Одно или несколько мест уже заняты",
      hint: formatGardensOccupiedSeatsMessage(e.seatKeys),
      error: "SEAT_UNAVAILABLE",
    };
  }

  if (e instanceof PromoApplyError) {
    return {
      ok: false,
      status: e.httpStatus,
      message: e.message,
      hint: e.message,
      error: e.code,
    };
  }

  const prismaCode = prismaErrorCode(e);
  if (prismaCode) {
    if (prismaCode === "P2002") {
      const target =
        typeof e === "object" && e !== null && "meta" in e ?
          (e as { meta?: { target?: unknown } }).meta?.target
        : undefined;
      if (Array.isArray(target) && target.includes("seatKey")) {
        console.warn("seatCheckout P2002 seat reservation conflict", { target });
      }
      return {
        ok: false,
        status: 409,
        message: "Одно или несколько мест уже заняты",
        hint: "Выбранные места уже заняты. Обновите схему и выберите другие.",
        error: "SEAT_UNAVAILABLE",
      };
    }
    if (prismaCode === "P2025") {
      return {
        ok: false,
        status: 404,
        message: "Сеанс не найден",
        hint: "Сеанс не найден. Обновите страницу.",
        error: "SLOT_NOT_FOUND",
      };
    }
    console.error("seatCheckout prisma", prismaCode, e);
    return {
      ok: false,
      status: 500,
      message: "Не удалось сохранить заказ",
      hint: "Не удалось сохранить заказ. Обновите страницу и попробуйте снова.",
      error: "SERVER_ERROR",
    };
  }

  if (e instanceof Prisma.PrismaClientInitializationError) {
    return {
      ok: false,
      status: 503,
      message: "Сервис временно недоступен",
      hint: "Сервис временно недоступен. Попробуйте через минуту.",
      error: "SERVICE_UNAVAILABLE",
    };
  }

  if (e instanceof Error) {
    if (e.message === "BEPAID_NOT_CONFIGURED") {
      return {
        ok: false,
        status: 503,
        message: "Оплата не настроена",
        hint: "Оплата временно недоступна. Попробуйте позже.",
        error: "PAYMENT_NOT_CONFIGURED",
      };
    }
    console.error("seatCheckout", e);
  } else {
    console.error("seatCheckout unknown", e);
  }

  return {
    ok: false,
    status: 500,
    message: "Не удалось оформить заказ",
    hint: "Не удалось оформить заказ. Обновите страницу и попробуйте снова.",
    error: "SERVER_ERROR",
  };
}

/** Сообщение для UI «Сады сновидений» по телу ответа POST /api/orders. */
export function formatGardensCheckoutError(
  body: { error?: string; hint?: string; message?: string },
  status: number,
): string {
  if (body.hint?.trim()) return body.hint.trim();
  if (body.message?.trim()) return body.message.trim();

  switch (body.error) {
    case "SEAT_UNAVAILABLE":
      return "Выбранные места уже заняты. Обновите схему и выберите другие.";
    case "INVALID_PROMO":
      return "Промокод не найден";
    case "PROMO_INACTIVE":
      return "Промокод недействителен или срок действия истёк";
    case "PROMO_EXHAUSTED":
      return "Лимит использований этого промокода исчерпан";
    case "PROMO_WRONG_CHANNEL":
      return "Промокод не действует для «Сады сновидений»";
    case "PROMO_ZERO_PAYMENT":
      return "После скидки сумма слишком мала для онлайн-оплаты";
    case "PROMO_UNAVAILABLE":
      return "Не удалось проверить промокод. Попробуйте позже.";
    case "INVALID_SEATS":
      return "Некорректный выбор мест";
    case "SLOT_NOT_FOUND":
      return "Сеанс не найден. Обновите страницу.";
    case "PAYMENT_NOT_CONFIGURED":
    case "SERVICE_UNAVAILABLE":
      return "Оплата временно недоступна. Попробуйте позже.";
    case "PAYMENT_CREATE_FAILED":
      return "Не удалось перейти к оплате. Попробуйте ещё раз.";
    case "VALIDATION":
      return "Проверьте контактные данные и выбор мест";
    case "SERVER_ERROR":
      return "Не удалось оформить заказ. Обновите страницу и попробуйте снова.";
    default:
      if (status === 409) {
        return "Выбранные места уже заняты. Обновите схему и выберите другие.";
      }
      if (status === 502 || status === 503) {
        return "Оплата временно недоступна. Попробуйте позже.";
      }
      if (status >= 500) {
        return "Не удалось оформить заказ. Обновите страницу и попробуйте снова.";
      }
      return body.error ? `Не удалось оформить заказ (${body.error})` : `Не удалось оформить заказ (${status})`;
  }
}
