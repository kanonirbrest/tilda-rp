import { prisma } from "@/lib/prisma";
import { refundBepaidPayment } from "@/lib/bepaid";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";

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
  let body: { parentUid?: unknown; reason?: unknown } = {};
  try {
    const j = await req.json();
    if (j && typeof j === "object") body = j as typeof body;
  } catch {
    /* пустое тело */
  }

  const parentOverride =
    typeof body.parentUid === "string" && body.parentUid.trim().length > 0 ?
      body.parentUid.trim().slice(0, 128)
    : undefined;
  const reason =
    typeof body.reason === "string" && body.reason.trim().length > 0 ?
      body.reason.trim().slice(0, 255)
    : "Возврат по запросу администратора";

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      amountCents: true,
      refundedCents: true,
      bepaidUid: true,
      bepaidPaymentUid: true,
    },
  });

  if (!order) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Заказ не найден" }, { status: 404 });
  }
  if (order.status === "REFUNDED") {
    return jsonWithCors(req, { ok: true, already: true, message: "Уже возвращён" });
  }
  if (order.status !== "PAID") {
    return jsonWithCors(
      req,
      { error: "INVALID_STATUS", message: "Возврат только для оплаченного заказа (PAID)." },
      { status: 400 },
    );
  }

  const remainingCents = order.amountCents - order.refundedCents;
  if (remainingCents < 1) {
    return jsonWithCors(req, {
      ok: true,
      already: true,
      message: "Сумма заказа уже полностью возвращена (частичные возвраты).",
    });
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
    amountCents: remainingCents,
    reason,
  });

  if (!refund.ok) {
    const st = refund.httpStatus >= 400 ? refund.httpStatus : 502;
    return jsonWithCors(req, { error: "BEPAID_REFUND_FAILED", message: refund.message }, { status: st });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.updateMany({
      where: { id: order.id, status: "PAID" },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundedCents: order.amountCents,
      },
    });
    if (o.count === 0) {
      return { race: true as const };
    }
    await tx.ticket.updateMany({
      where: { orderId: order.id, refundedAt: null },
      data: { refundedAt: new Date() },
    });
    return { race: false as const };
  });

  if (updated.race) {
    const cur = await prisma.order.findUnique({ where: { id: order.id }, select: { status: true } });
    if (cur?.status === "REFUNDED") {
      return jsonWithCors(req, { ok: true, already: true, message: "Уже возвращён (параллельный запрос)." });
    }
    return jsonWithCors(
      req,
      {
        error: "RACE",
        message:
          "Статус заказа изменился. Возврат в bePaid мог выполниться — проверьте заказ и кабинет bePaid.",
      },
      { status: 409 },
    );
  }

  return jsonWithCors(req, {
    ok: true,
    orderId: order.id,
    status: "REFUNDED" as const,
    refundAmountCents: remainingCents,
  });
}
