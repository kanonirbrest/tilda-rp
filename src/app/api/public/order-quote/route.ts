import { NextResponse } from "next/server";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
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
 * GET ?date=YYYY-MM-DD&time=HH:MM&adult=&child=&concession=
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date")?.trim() ?? "";
  const time = searchParams.get("time")?.trim() ?? "";
  const adult = parseTicketCountParam(searchParams.get("adult"));
  const child = parseTicketCountParam(searchParams.get("child"));
  const concession = parseTicketCountParam(searchParams.get("concession"));

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return jsonPublicReadResponse(req, { error: "DATE_REQUIRED", hint: "Укажите date в формате YYYY-MM-DD" }, 400);
  }
  if (!time) {
    return jsonPublicReadResponse(req, { error: "TIME_REQUIRED", hint: "Укажите time (например 14:00)" }, 400);
  }

  const resolved = await resolveCheckoutSlot({ slotId: null, date, time });
  if (!resolved.ok) {
    const code = resolved.code;
    const status =
      code === "DATE_REQUIRED" || code === "TIME_REQUIRED" ? 400 : code === "AMBIGUOUS" ? 409 : 404;
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

  return jsonPublicReadResponse(
    req,
    {
      totalCents,
      currency,
      formattedTotal: formatTotal(totalCents, currency),
    },
    200,
  );
}
