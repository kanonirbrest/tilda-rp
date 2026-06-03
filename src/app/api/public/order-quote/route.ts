import { NextResponse } from "next/server";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { resolvePromoForQuote } from "@/lib/resolve-order-promo";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
import { normalizeSlotKind } from "@/lib/slot-kind";
import { buildLinesFromCounts, totalCentsForLines } from "@/lib/slot-pricing";
import { parseTicketCountParam } from "@/lib/ticket-checkout-params";

function formatTotal(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency.length === 3 ? currency : "BYN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/**
 * Публичная оценка суммы заказа для Тильды (без создания заказа).
 * GET ?date=YYYY-MM-DD&time=HH:MM&adult=&child=&concession=&promoCode=
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const time = searchParams.get("time")?.trim() ?? "";
  const slotKind = normalizeSlotKind(searchParams.get("kind"));
  const adult = parseTicketCountParam(searchParams.get("adult"));
  const child = parseTicketCountParam(searchParams.get("child"));
  const concession = parseTicketCountParam(searchParams.get("concession"));
  const promoRaw =
    searchParams.get("promoCode")?.trim() || searchParams.get("promo")?.trim() || "";

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonPublicReadResponse(req, { error: "DATE_REQUIRED", hint: "Укажите date в формате YYYY-MM-DD" }, 400);
  }
  if (!time) {
    return jsonPublicReadResponse(req, { error: "TIME_REQUIRED", hint: "Укажите time (например 14:00)" }, 400);
  }

  try {
    const resolved = await resolveCheckoutSlot({ slotId: null, date, time, slotKind });
  if (!resolved.ok) {
    const code = resolved.code;
    const status =
      code === "DATE_REQUIRED" || code === "TIME_REQUIRED" || code === "TIME_PAST" ?
        400
      : code === "AMBIGUOUS" ? 409
      : 404;
    return jsonPublicReadResponse(
      req,
      { error: code, hint: messageForResolveFailure(code, "checkout") },
      status,
    );
  }

  const slot = resolved.slot;
  const lines = buildLinesFromCounts(slot, { adult, child, concession });
  const totalCents = totalCentsForLines(slot, lines);
  const currency = slot.currency || "BYN";
  const formattedTotal = formatTotal(totalCents, currency);

  type PromoOk = {
    applied: true;
    discountCents: number;
    amountCents: number;
    formattedAmount: string;
    hint?: string;
  };
  type PromoErr = { applied: false; error: string; hint: string };
  let promo: PromoOk | PromoErr | null = null;

  if (promoRaw) {
    const resolved = await resolvePromoForQuote(promoRaw, totalCents, slot);
    if (!resolved) {
      promo = { applied: false, error: "INVALID_PROMO", hint: "Промокод не найден" };
    } else if (!resolved.applied) {
      promo = { applied: false, error: resolved.error, hint: resolved.hint };
    } else {
      promo = {
        applied: true,
        discountCents: resolved.discountCents,
        amountCents: resolved.amountCents,
        formattedAmount: formatTotal(resolved.amountCents, currency),
        ...(resolved.hint ? { hint: resolved.hint } : {}),
      };
    }
  }

    return jsonPublicReadResponse(
      req,
      {
        totalCents,
        currency,
        kind: slotKind,
        formattedTotal,
        promo,
      },
      200,
    );
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
