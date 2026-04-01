import { NextResponse } from "next/server";
import { createOrderCheckout } from "@/lib/create-order-checkout";
import { getRequestOrigin } from "@/lib/request-origin";
import { absoluteRedirectFromRequest, payHtmlError } from "@/lib/pay-http";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
import { buildLinesFromCounts } from "@/lib/slot-pricing";
import {
  hasDateAndTimeInQuery,
  normalizeTicketCounts,
  parseTicketCountParam,
} from "@/lib/ticket-checkout-params";

/**
 * Прямой переход с Тильды: проверка слота в БД → заказ → редирект на bePaid или /success.
 * Пример:
 * /pay?date=2026-04-15&time=14:00&adult=2&child=0&concession=0&name=...&email=...&phone=...
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name")?.trim() ?? "";
  const email = searchParams.get("email")?.trim() ?? "";
  const phone = searchParams.get("phone")?.trim() ?? "";

  if (!name) {
    return payHtmlError(400, "Укажите параметр name (имя из формы Тильды).");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return payHtmlError(400, "Укажите корректный параметр email.");
  }
  if (phone.length < 6) {
    return payHtmlError(400, "Укажите параметр phone (не короче 6 символов).");
  }

  const slotIdParam = searchParams.get("slotId");
  const date = searchParams.get("date");
  const time = searchParams.get("time");
  const adult = parseTicketCountParam(searchParams.get("adult"));
  const child = parseTicketCountParam(searchParams.get("child"));
  const concession = parseTicketCountParam(searchParams.get("concession"));

  const resolved = await resolveCheckoutSlot({
    slotId: slotIdParam,
    date,
    time,
  });

  if (!resolved.ok) {
    return payHtmlError(404, messageForResolveFailure(resolved.code, "pay"));
  }

  const fromTilda = hasDateAndTimeInQuery(date, time);
  const countsNorm = normalizeTicketCounts(adult, child, concession, {
    requireCountsWhenDateTime: fromTilda,
  });
  if (!countsNorm.ok) {
    return payHtmlError(400, "Укажите количество билетов: adult, child и/или concession.");
  }
  const { adult: a, child: c, concession: co } = countsNorm.counts;

  const lines = buildLinesFromCounts(resolved.slot, { adult: a, child: c, concession: co });

  const result = await createOrderCheckout(
    {
      slotId: resolved.slot.id,
      name,
      email,
      phone,
      lines,
    },
    getRequestOrigin(req),
  );

  if (!result.ok) {
    return payHtmlError(result.status, result.hint ?? result.message);
  }

  return NextResponse.redirect(absoluteRedirectFromRequest(req, result.redirectUrl), 302);
}
