import { NextResponse } from "next/server";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { prisma } from "@/lib/prisma";
import {
  computePromoAmounts,
  isPromoActiveBySchedule,
  normalizePromoCode,
  promoAppliesToSlotKind,
} from "@/lib/promo-code";
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

  const resolved = await resolveCheckoutSlot({ slotId: null, date, time, slotKind });
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
  const formattedTotal = formatTotal(totalCents, currency);

  type PromoOk = {
    applied: true;
    discountCents: number;
    amountCents: number;
    formattedAmount: string;
  };
  type PromoErr = { applied: false; error: string; hint: string };
  let promo: PromoOk | PromoErr | null = null;

  if (promoRaw) {
    const norm = normalizePromoCode(promoRaw);
    const row = await prisma.promoCode.findUnique({ where: { code: norm } });
    if (!row) {
      promo = { applied: false, error: "INVALID_PROMO", hint: "Промокод не найден" };
    } else {
      const now = new Date();
      if (!isPromoActiveBySchedule(row, now)) {
        promo = {
          applied: false,
          error: "PROMO_INACTIVE",
          hint: "Промокод недействителен или срок действия истёк",
        };
      } else if (!promoAppliesToSlotKind(row, slot.kind)) {
        promo = {
          applied: false,
          error: "PROMO_WRONG_CHANNEL",
          hint: "Промокод не действует для этого канала продажи",
        };
      } else if (row.maxUses != null) {
        const used = await prisma.order.count({
          where: {
            promoCodeId: row.id,
            status: { in: ["PENDING", "PAID"] },
          },
        });
        if (used >= row.maxUses) {
          promo = {
            applied: false,
            error: "PROMO_EXHAUSTED",
            hint: "Лимит использований этого промокода исчерпан",
          };
        }
      }
      if (!promo) {
        const { discountCents, amountCents } = computePromoAmounts(totalCents, row);
        if (amountCents < 1) {
          promo = {
            applied: false,
            error: "PROMO_ZERO_PAYMENT",
            hint: "После скидки сумма слишком мала для онлайн-оплаты",
          };
        } else {
          promo = {
            applied: true,
            discountCents,
            amountCents,
            formattedAmount: formatTotal(amountCents, currency),
          };
        }
      }
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
}
