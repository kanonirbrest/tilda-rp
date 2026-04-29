import { prisma } from "@/lib/prisma";
import { refundBepaidPayment } from "@/lib/bepaid";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import {
  listPriceCentsPerTicket,
  paidCentsForTicketAtIndex,
} from "@/lib/ticket-refund-alloc";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

function bepaidRefundConfigured(): boolean {
  return Boolean(process.env.BEPAID_SHOP_ID?.trim() && process.env.BEPAID_SECRET_KEY?.trim());
}

export async function POST(req: Request, ctx: { params: Promise<{ orderId: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  if (!bepaidRefundConfigured()) {
    return jsonWithCors(
      req,
      {
        error: "BEPAID_NOT_CONFIGURED",
        message: "Возврат через bePaid недоступен: не заданы BEPAID_SHOP_ID и BEPAID_SECRET_KEY.",
      },
      { status: 503 },
    );
  }

  const { orderId } = await ctx.params;
  let body: { ticketId?: unknown; parentUid?: unknown; reason?: unknown } = {};
  try {
    const j = await req.json();
    if (j && typeof j === "object") body = j as typeof body;
  } catch {
    /* пустое тело */
  }

  const ticketId = typeof body.ticketId === "string" ? body.ticketId.trim() : "";
  if (!ticketId) {
    return jsonWithCors(req, { error: "VALIDATION", message: "Укажите ticketId в теле запроса." }, { status: 400 });
  }

  const parentOverride =
    typeof body.parentUid === "string" && body.parentUid.trim().length > 0 ?
      body.parentUid.trim().slice(0, 128)
    : undefined;
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0 ?
      body.reason.trim().slice(0, 255)
    : "Возврат билета по запросу администратора";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      amountCents: true,
      subtotalCents: true,
      refundedCents: true,
      bepaidUid: true,
      bepaidPaymentUid: true,
      lines: { orderBy: { id: "asc" } },
      tickets: {
        orderBy: { createdAt: "asc" },
        select: { id: true, refundedAt: true, usedAt: true },
      },
    },
  });

  if (!order) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Заказ не найден" }, { status: 404 });
  }
  if (order.status === "REFUNDED") {
    return jsonWithCors(req, { ok: true, already: true, message: "Заказ уже полностью возвращён" });
  }
  if (order.status !== "PAID") {
    return jsonWithCors(
      req,
      { error: "INVALID_STATUS", message: "Возврат только для оплаченного заказа (PAID)." },
      { status: 400 },
    );
  }

  const ticket = order.tickets.find((t) => t.id === ticketId);
  if (!ticket) {
    return jsonWithCors(req, { error: "TICKET_NOT_IN_ORDER", message: "Билет не принадлежит этому заказу." }, { status: 400 });
  }
  if (ticket.refundedAt) {
    return jsonWithCors(req, { error: "ALREADY_REFUNDED", message: "Этот билет уже возвращён." }, { status: 409 });
  }
  if (ticket.usedAt) {
    return jsonWithCors(
      req,
      {
        error: "TICKET_USED",
        message: "Билет уже отмечен как использованный — возврат через админку недоступен.",
      },
      { status: 400 },
    );
  }

  const idx = order.tickets.findIndex((t) => t.id === ticketId);
  const weights = listPriceCentsPerTicket(order.lines, order.tickets.length);
  let refundAmount = paidCentsForTicketAtIndex(
    order.amountCents,
    order.subtotalCents,
    weights,
    idx,
  );

  const remainingBudget = order.amountCents - order.refundedCents;
  if (remainingBudget < 1) {
    return jsonWithCors(
      req,
      {
        error: "NOTHING_TO_REFUND",
        message: "По заказу не осталось суммы для возврата (проверьте refundedCents и статус).",
      },
      { status: 400 },
    );
  }
  refundAmount = Math.min(refundAmount, remainingBudget);

  if (refundAmount < 1) {
    return jsonWithCors(
      req,
      {
        error: "ZERO_AMOUNT",
        message: "Расчётная сумма возврата для билета равна нулю.",
      },
      { status: 400 },
    );
  }

  const parentUid = order.bepaidPaymentUid ?? order.bepaidUid ?? parentOverride;
  if (!parentUid) {
    return jsonWithCors(
      req,
      {
        error: "NO_PAYMENT_UID",
        message:
          "Нет идентификатора платежа в базе. Укажите parent_uid из личного кабинета bePaid в теле: {\"parentUid\":\"…\"}.",
      },
      { status: 400 },
    );
  }

  const refund = await refundBepaidPayment({
    parentUid,
    amountCents: refundAmount,
    reason,
  });

  if (!refund.ok) {
    const st = refund.httpStatus >= 400 ? refund.httpStatus : 502;
    return jsonWithCors(req, { error: "BEPAID_REFUND_FAILED", message: refund.message }, { status: st });
  }

  const newRefundedTotal = order.refundedCents + refundAmount;
  const fullySettled = newRefundedTotal >= order.amountCents;

  const updated = await prisma.$transaction(async (tx) => {
    const mark = await tx.ticket.updateMany({
      where: { id: ticketId, orderId: order.id, refundedAt: null },
      data: { refundedAt: new Date() },
    });
    if (mark.count === 0) {
      return { kind: "duplicate" as const };
    }

    await tx.order.update({
      where: { id: order.id },
      data: {
        refundedCents: newRefundedTotal,
        ...(fullySettled ?
          {
            status: "REFUNDED",
            refundedAt: new Date(),
          }
        : {}),
      },
    });

    if (fullySettled) {
      await tx.ticket.updateMany({
        where: { orderId: order.id, refundedAt: null },
        data: { refundedAt: new Date() },
      });
    }

    return { kind: "ok" as const };
  });

  if (updated.kind === "duplicate") {
    return jsonWithCors(req, { ok: true, already: true, message: "Билет уже был возвращён (повтор запроса)." });
  }

  return jsonWithCors(req, {
    ok: true,
    orderId: order.id,
    ticketId,
    refundAmountCents: refundAmount,
    orderStatus: fullySettled ? ("REFUNDED" as const) : ("PAID" as const),
    refundedCentsTotal: newRefundedTotal,
  });
}
