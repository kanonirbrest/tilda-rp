import { NextResponse } from "next/server";
import { ensureGardensPromos } from "@/lib/gardens-of-dreams/ensure-promo";
import { ensureGardensSlots, gardensSeatMapVariantForSlot, gardensSeatPriceOverridesForSlot, gardensSeatSaleOverridesForSlot } from "@/lib/gardens-of-dreams/ensure-slots";
import { getGardensSeatWithOverrides } from "@/lib/gardens-of-dreams/seat-map";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { resolvePromoForQuote } from "@/lib/resolve-order-promo";
import { expireStalePendingOrdersAndReleaseSeats } from "@/lib/expire-pending-orders";
import { prisma } from "@/lib/prisma";
import { GARDENS_OF_DREAMS_SLOT_KIND, VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";
import { ensureVivaldiSlots } from "@/lib/vivaldi/ensure-slots";
import { vivaldiVolumeDiscountCents, vivaldiVolumeDiscountHint } from "@/lib/vivaldi/pricing";
import { vivaldiDateForStartsAt, vivaldiVolumeDiscountApplies } from "@/lib/vivaldi/schedule";
import { getVivaldiSeat } from "@/lib/vivaldi/seat-map";

function formatTotal(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: currency.length === 3 ? currency : "BYN",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/**
 * Оценка суммы заказа с местами (Сады сновидений).
 * GET ?slotId=&seats=B:1:15,B:1:16&promoCode=
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get("slotId")?.trim() ?? "";
  const seatsRaw = searchParams.get("seats")?.trim() ?? "";
  const promoRaw =
    searchParams.get("promoCode")?.trim() || searchParams.get("promo")?.trim() || "";

  if (!slotId) {
    return jsonPublicReadResponse(req, { error: "SLOT_REQUIRED", hint: "Укажите slotId" }, 400);
  }

  const seatKeys = [...new Set(seatsRaw.split(",").map((k) => k.trim()).filter(Boolean))];
  if (seatKeys.length === 0) {
    return jsonPublicReadResponse(
      req,
      { error: "SEATS_REQUIRED", hint: "Укажите seats (ключи мест через запятую)" },
      400,
    );
  }

  try {
    await ensureGardensSlots();
    await ensureGardensPromos();
    await ensureVivaldiSlots();
    await expireStalePendingOrdersAndReleaseSeats();

    const slot = await prisma.slot.findFirst({
      where: { id: slotId, active: true },
    });
    if (!slot || (slot.kind !== GARDENS_OF_DREAMS_SLOT_KIND && slot.kind !== VIVALDI_CONCERT_SLOT_KIND)) {
      return jsonPublicReadResponse(req, { error: "SLOT_NOT_FOUND", hint: "Сеанс не найден" }, 404);
    }

    const variant = slot.kind === GARDENS_OF_DREAMS_SLOT_KIND ? gardensSeatMapVariantForSlot(slot) : null;
    const overrides = slot.kind === GARDENS_OF_DREAMS_SLOT_KIND ? gardensSeatSaleOverridesForSlot(slot) : null;
    const priceOverrides =
      slot.kind === GARDENS_OF_DREAMS_SLOT_KIND ? gardensSeatPriceOverridesForSlot(slot) : null;
    const vivaldiDate = slot.kind === VIVALDI_CONCERT_SLOT_KIND ? vivaldiDateForStartsAt(slot.startsAt) : "";
    const seats = seatKeys.map((key) =>
      slot.kind === VIVALDI_CONCERT_SLOT_KIND
        ? getVivaldiSeat(key, vivaldiDate)
        : getGardensSeatWithOverrides(key, variant ?? "default", overrides, priceOverrides),
    );
    if (seats.some((s) => !s?.selectable)) {
      return jsonPublicReadResponse(
        req,
        { error: "INVALID_SEATS", hint: "Некорректный выбор мест" },
        400,
      );
    }

    const subtotalCents = seats.reduce((sum, s) => sum + (s?.priceCents ?? 0), 0);
    const volumeOn = slot.kind === VIVALDI_CONCERT_SLOT_KIND && vivaldiVolumeDiscountApplies(vivaldiDate);
    const volumeDiscountCents = volumeOn
      ? vivaldiVolumeDiscountCents(seats.length, subtotalCents)
      : 0;
    const pricedSubtotalCents = subtotalCents - volumeDiscountCents;
    const currency = slot.currency || "BYN";

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
      const resolved = await resolvePromoForQuote(promoRaw, pricedSubtotalCents, slot);
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

    const amountCents = promo?.applied === true ? promo.amountCents : pricedSubtotalCents;
    const volumeHint = volumeOn ? vivaldiVolumeDiscountHint(seats.length) : null;

    return jsonPublicReadResponse(
      req,
      {
        subtotalCents,
        volumeDiscountCents,
        ...(volumeHint ? { volumeDiscountHint: volumeHint } : {}),
        totalCents: amountCents,
        currency,
        formattedSubtotal: formatTotal(subtotalCents, currency),
        formattedTotal: formatTotal(amountCents, currency),
        promo,
      },
      200,
    );
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
