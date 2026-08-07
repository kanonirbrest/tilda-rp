import { NextResponse } from "next/server";
import { ensureNeboGiftOpenDateSlot } from "@/lib/nebo-reka/ensure-gift-slot";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { unitPriceCents } from "@/lib/slot-pricing";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/** Служебный слот «Небо.Река — подарочный билет» (открытая дата). */
export async function GET(req: Request) {
  try {
    const slot = await ensureNeboGiftOpenDateSlot();
    return jsonPublicReadResponse(
      req,
      {
        slotId: slot.id,
        currency: slot.currency || "BYN",
        prices: {
          adult: unitPriceCents(slot, "ADULT"),
          child: unitPriceCents(slot, "CHILD"),
          concession: unitPriceCents(slot, "CONCESSION"),
        },
      },
      200,
    );
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
