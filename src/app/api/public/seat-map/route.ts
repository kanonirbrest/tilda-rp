import { NextResponse } from "next/server";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { ensureGardensSlots, findGardensOccupiedSeatKeys, gardensSeatMapVariantForSlot } from "@/lib/gardens-of-dreams/ensure-slots";
import {
  buildGardensSeatMap,
  formatGardensPrice,
  GARDENS_ECONOMY_CENTS,
  GARDENS_LEGEND,
  GARDENS_PREMIUM_CENTS,
  GARDENS_STANDARD_CENTS,
} from "@/lib/gardens-of-dreams/seat-map";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
import { expireStalePendingOrdersAndReleaseSeats } from "@/lib/expire-pending-orders";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/**
 * Схема зала и занятые места для сеанса.
 * GET ?slotId=…  или  ?date=YYYY-MM-DD&time=HH:MM
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slotId = searchParams.get("slotId")?.trim() ?? "";
  const date = searchParams.get("date")?.trim() ?? "";
  const time = searchParams.get("time")?.trim() ?? "";

  try {
    await ensureGardensSlots();
    await expireStalePendingOrdersAndReleaseSeats();

    const resolved = await resolveCheckoutSlot({
      slotId: slotId || null,
      date: date || null,
      time: time || null,
      slotKind: GARDENS_OF_DREAMS_SLOT_KIND,
    });
    if (!resolved.ok) {
      const code = resolved.code;
      const status =
        code === "DATE_REQUIRED" || code === "TIME_REQUIRED" || code === "TIME_PAST" ? 400
        : code === "AMBIGUOUS" ? 409
        : 404;
      return jsonPublicReadResponse(
        req,
        { error: code, hint: messageForResolveFailure(code, "checkout") },
        status,
      );
    }

    const slot = resolved.slot;
    if (slot.kind !== GARDENS_OF_DREAMS_SLOT_KIND) {
      return jsonPublicReadResponse(req, { error: "WRONG_SLOT_KIND" }, 400);
    }

    const occupied = [...(await findGardensOccupiedSeatKeys(slot.id))];
    const variant = gardensSeatMapVariantForSlot(slot);
    const seats = buildGardensSeatMap(variant);

    return jsonPublicReadResponse(
      req,
      {
        slotId: slot.id,
        title: slot.title,
        startsAt: slot.startsAt.toISOString(),
        currency: slot.currency,
        seats,
        occupied,
        legend: GARDENS_LEGEND,
        prices: {
          premium: GARDENS_PREMIUM_CENTS,
          standard: GARDENS_STANDARD_CENTS,
          economy: GARDENS_ECONOMY_CENTS,
          premiumLabel: formatGardensPrice(GARDENS_PREMIUM_CENTS),
          standardLabel: formatGardensPrice(GARDENS_STANDARD_CENTS),
          economyLabel: formatGardensPrice(GARDENS_ECONOMY_CENTS),
        },
      },
      200,
    );
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
