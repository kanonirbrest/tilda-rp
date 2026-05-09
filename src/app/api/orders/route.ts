import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderCheckout } from "@/lib/create-order-checkout";
import { prisma } from "@/lib/prisma";
import { jsonOrdersResponse, publicOrdersCorsHeaders } from "@/lib/public-orders-cors";
import { getRequestOrigin } from "@/lib/request-origin";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
import { normalizeSlotKind } from "@/lib/slot-kind";
import { buildLinesFromCounts, type LineInput } from "@/lib/slot-pricing";
import {
  hasDateAndTimeInQuery,
  normalizeTicketCounts,
} from "@/lib/ticket-checkout-params";

const lineSchema = z.object({
  tier: z.enum(["ADULT", "CHILD", "CONCESSION"]),
  quantity: z.number().int().min(0),
});

const bodySchema = z
  .object({
    slotKind: z.string().trim().max(64).optional(),
    slotId: z.string().trim().min(1).optional(),
    date: z.string().optional(),
    time: z.string().optional(),
    adult: z.number().int().min(0).optional(),
    child: z.number().int().min(0).optional(),
    concession: z.number().int().min(0).optional(),
    name: z.string().trim().min(1, "укажите имя").max(200),
    email: z.string().trim().email("некорректный email").max(320),
    phone: z
      .string()
      .trim()
      .min(6, "телефон слишком короткий")
      .max(40, "телефон слишком длинный"),
    lines: z.array(lineSchema).optional(),
    promoCode: z.string().trim().max(64).optional(),
  })
  .refine(
    (d) =>
      Boolean(d.slotId?.length) ||
      (Boolean(d.date?.trim()) && Boolean(d.time?.trim())),
    { message: "Нужен slotId или пара date и time", path: ["slotId"] },
  );

function resolveFailureStatus(code: "SLOT_NOT_FOUND" | "DATE_REQUIRED" | "TIME_REQUIRED" | "AMBIGUOUS"): number {
  if (code === "DATE_REQUIRED" || code === "TIME_REQUIRED") return 400;
  if (code === "AMBIGUOUS") return 409;
  return 404;
}

function absoluteRedirectUrl(req: Request, redirectUrl: string): string {
  if (redirectUrl.startsWith("http://") || redirectUrl.startsWith("https://")) {
    return redirectUrl;
  }
  const base = getRequestOrigin(req).replace(/\/$/, "");
  return new URL(redirectUrl, `${base}/`).href;
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicOrdersCorsHeaders(req) });
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonOrdersResponse(req, { error: "INVALID_JSON" }, 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonOrdersResponse(
      req,
      { error: "VALIDATION", details: parsed.error.flatten() },
      400,
    );
  }

  const d = parsed.data;
  const slotKind = normalizeSlotKind(d.slotKind);
  const { name, email, phone } = d;
  const lineItems = (d.lines ?? []).filter((l) => l.quantity > 0);

  const resolved = await resolveCheckoutSlot({
    slotId: d.slotId ?? null,
    date: d.date ?? null,
    time: d.time ?? null,
    slotKind,
  });

  if (!resolved.ok) {
    const code = resolved.code;
    return jsonOrdersResponse(
      req,
      { error: code, hint: messageForResolveFailure(code, "checkout") },
      resolveFailureStatus(code),
    );
  }

  let lines: LineInput[];
  if (lineItems.length > 0) {
    lines = lineItems;
  } else {
    const adult = d.adult ?? 0;
    const child = d.child ?? 0;
    const concession = d.concession ?? 0;
    const fromDateTime = hasDateAndTimeInQuery(d.date, d.time);
    const countsNorm = normalizeTicketCounts(adult, child, concession, {
      requireCountsWhenDateTime: fromDateTime,
    });
    if (!countsNorm.ok) {
      return jsonOrdersResponse(
        req,
        {
          error: "TICKET_COUNTS_REQUIRED",
          hint: "Укажите количество билетов: adult, child и/или concession (или массив lines).",
        },
        400,
      );
    }
    const { adult: a, child: c, concession: co } = countsNorm.counts;
    lines = buildLinesFromCounts(resolved.slot, { adult: a, child: c, concession: co });
  }

  const promoRaw = d.promoCode?.trim() ? d.promoCode : undefined;

  const result = await createOrderCheckout(
    {
      slotId: resolved.slot.id,
      name,
      email,
      phone,
      lines,
      promoCode: promoRaw,
    },
    getRequestOrigin(req),
  );

  if (!result.ok) {
    if (result.status === 404) {
      return jsonOrdersResponse(req, { error: "SLOT_NOT_FOUND" }, 404);
    }
    if (result.status === 400) {
      const errKey =
        result.error === "INVALID_PROMO" ||
        result.error === "PROMO_INACTIVE" ||
        result.error === "PROMO_EXHAUSTED" ||
        result.error === "PROMO_ZERO_PAYMENT" ||
        result.error === "PROMO_WRONG_CHANNEL" ?
          result.error
        : "INVALID_LINES";
      return jsonOrdersResponse(
        req,
        { error: errKey, hint: result.message },
        400,
      );
    }
    if (result.status === 409) {
      return jsonOrdersResponse(req, { error: "CAPACITY_EXCEEDED", hint: result.message }, 409);
    }
    if (result.status === 503) {
      return jsonOrdersResponse(
        req,
        {
          error: "PAYMENT_NOT_CONFIGURED",
          hint: result.hint ?? result.message,
        },
        503,
      );
    }
    if (result.status === 502) {
      return jsonOrdersResponse(req, { error: "PAYMENT_CREATE_FAILED" }, 502);
    }
    return jsonOrdersResponse(
      req,
      {
        error: "SERVER_ERROR",
        hint: process.env.NODE_ENV === "development" ? result.message : undefined,
      },
      500,
    );
  }

  let ticketToken: string | undefined;
  let ticketTokens: string[] | undefined;
  if (process.env.DEV_SKIP_PAYMENT === "true") {
    const rows = await prisma.ticket.findMany({
      where: { orderId: result.orderId },
      select: { publicToken: true },
      orderBy: { createdAt: "asc" },
    });
    ticketTokens = rows.map((r) => r.publicToken);
    ticketToken = ticketTokens[0];
  }

  return jsonOrdersResponse(
    req,
    {
      orderId: result.orderId,
      ticketToken,
      ticketTokens,
      redirectUrl: absoluteRedirectUrl(req, result.redirectUrl),
    },
    200,
  );
}
