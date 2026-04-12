import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fulfillPaidOrder } from "@/lib/fulfill-order";

/**
 * Checkout API иногда кладёт полезную нагрузку во вложенный `checkout`;
 * плюс `tracking_id` может быть в `transaction`, а не только в `order`.
 */
function normalizeBepaidWebhookBody(raw: Record<string, unknown>): Record<string, unknown> {
  const checkout = raw.checkout as Record<string, unknown> | undefined;
  if (checkout && typeof checkout === "object") {
    return { ...checkout, ...raw };
  }
  return raw;
}

function idPreview(id: string | undefined | null): { len: number; head: string; tail: string } | null {
  if (id == null || id === "") return null;
  const len = id.length;
  const head = id.slice(0, 6);
  const tail = id.slice(-8);
  return { len, head, tail };
}

/** Идемпотентность вебхука: стабильный внешний id */
function pickWebhookExternalId(body: Record<string, unknown>): string | undefined {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txUid = (transaction?.uid ?? transaction?.id) as string | undefined;
  const token = typeof body.token === "string" ? body.token : undefined;
  const orderBlock = body.order as Record<string, unknown> | undefined;
  const trackingOrder =
    typeof orderBlock?.tracking_id === "string" ? orderBlock.tracking_id : undefined;
  const trackingTx =
    typeof transaction?.tracking_id === "string" ? transaction.tracking_id : undefined;
  return txUid || token || trackingOrder || trackingTx || (body.uid as string | undefined);
}

/** Откуда взят externalId (для логов). */
function describeExternalIdSource(body: Record<string, unknown>): string {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txUid = (transaction?.uid ?? transaction?.id) as string | undefined;
  if (txUid) return "transaction.uid|id";
  if (typeof body.token === "string" && body.token) return "token";
  const orderBlock = body.order as Record<string, unknown> | undefined;
  if (typeof orderBlock?.tracking_id === "string") return "order.tracking_id";
  const trackingTx =
    typeof transaction?.tracking_id === "string" ? transaction.tracking_id : undefined;
  if (trackingTx) return "transaction.tracking_id";
  if (typeof body.uid === "string") return "body.uid";
  return "none";
}

function orderWhereFromWebhook(body: Record<string, unknown>): Prisma.OrderWhereInput {
  const or: Prisma.OrderWhereInput[] = [];
  const token = typeof body.token === "string" ? body.token : undefined;
  if (token) or.push({ bepaidUid: token });
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txnUid = (transaction?.uid ?? transaction?.id) as string | undefined;
  if (txnUid) or.push({ bepaidUid: txnUid });
  const payment = body.payment as Record<string, unknown> | undefined;
  const payUid = payment?.uid as string | undefined;
  if (payUid) or.push({ bepaidUid: payUid });
  const orderBlock = body.order as Record<string, unknown> | undefined;
  const trackingId = orderBlock?.tracking_id as string | undefined;
  if (trackingId) or.push({ id: trackingId });
  const trackingFromTx =
    typeof transaction?.tracking_id === "string" ? transaction.tracking_id : undefined;
  if (trackingFromTx) or.push({ id: trackingFromTx });
  return or.length ? { OR: or } : {};
}

/** Какие ветки OR построены для поиска заказа (без полных секретов). */
function orderLookupBranches(body: Record<string, unknown>) {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const gateway = body.gateway_response as Record<string, unknown> | undefined;
  const gwPayment = gateway?.payment as Record<string, unknown> | undefined;
  const orderBlock = body.order as Record<string, unknown> | undefined;
  const gwUid = typeof gwPayment?.uid === "string" ? gwPayment.uid : undefined;
  return {
    byToken: Boolean(typeof body.token === "string" && body.token),
    byTransactionUid: Boolean(transaction?.uid ?? transaction?.id),
    byTopPaymentUid: Boolean(body.payment && (body.payment as Record<string, unknown>).uid),
    byOrderTrackingId: typeof orderBlock?.tracking_id === "string",
    byTransactionTrackingId: typeof transaction?.tracking_id === "string",
    gatewayPaymentUidPresent: Boolean(gwUid),
    gatewayPaymentUidPreview: idPreview(gwUid) ?? null,
    trackingIdHead:
      typeof orderBlock?.tracking_id === "string"
        ? idPreview(orderBlock.tracking_id)?.head ?? "?"
        : null,
  };
}

function pickStatus(body: Record<string, unknown>): string | undefined {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txPayment = transaction?.payment as Record<string, unknown> | undefined;
  const payment = body.payment as Record<string, unknown> | undefined;
  const gateway = body.gateway_response as Record<string, unknown> | undefined;
  const gwPayment = gateway?.payment as Record<string, unknown> | undefined;
  /**
   * Checkout (виджет / CTP): итоговый статус часто в `checkout.status` или в
   * `gateway_response.payment.status`. Раньше сначала брался `transaction.status` —
   * при неполном `transaction` можно было получить не «successful» и пропускать оплату.
   */
  return (
    (body.status as string | undefined) ||
    (gwPayment?.status as string | undefined) ||
    (txPayment?.status as string | undefined) ||
    (payment?.status as string | undefined) ||
    (transaction?.status as string | undefined)
  );
}

/** Все кандидаты статуса отдельно — чтобы в логах видеть расхождения. */
function statusCandidatesForLog(body: Record<string, unknown>): Record<string, unknown> {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txPayment = transaction?.payment as Record<string, unknown> | undefined;
  const payment = body.payment as Record<string, unknown> | undefined;
  const gateway = body.gateway_response as Record<string, unknown> | undefined;
  const gwPayment = gateway?.payment as Record<string, unknown> | undefined;
  return {
    chosen: pickStatus(body),
    bodyStatus: body.status ?? null,
    gatewayPaymentStatus: gwPayment?.status ?? null,
    transactionPaymentStatus: txPayment?.status ?? null,
    topLevelPaymentStatus: payment?.status ?? null,
    transactionStatus: transaction?.status ?? null,
    finished: body.finished === true,
    expired: body.expired === true,
    testFlag: body.test === true,
    messagePreview:
      typeof body.message === "string" ? body.message.slice(0, 160) : null,
    hasGatewayResponse: Boolean(gateway && typeof gateway === "object"),
    hasTransaction: Boolean(transaction && typeof transaction === "object"),
  };
}

function isPaidStatus(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return (
    s === "successful" ||
    s === "success" ||
    s === "paid" ||
    s === "completed" ||
    s === "complete" ||
    s === "ok"
  );
}

export async function POST(req: Request) {
  const hasAuthHeader = Boolean(req.headers.get("authorization"));
  const contentType = req.headers.get("content-type");

  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch (e) {
    console.warn("[bePaid webhook] невалидный JSON", {
      hasAuthHeader,
      contentType,
      parseError: e instanceof Error ? e.message : String(e),
    });
    return new NextResponse("bad json", { status: 400 });
  }

  const rawKeys = Object.keys(raw);
  const hadNestedCheckout = Boolean(raw.checkout && typeof raw.checkout === "object");
  const body = normalizeBepaidWebhookBody(raw);

  console.info("[bePaid webhook] разбор тела", {
    hasAuthHeader,
    contentType,
    rawTopLevelKeys: rawKeys,
    hadNestedCheckout,
    normalizedKeyCount: Object.keys(body).length,
    normalizedKeysSample: Object.keys(body).slice(0, 35),
  });

  const externalId = pickWebhookExternalId(body);
  const externalIdSource = describeExternalIdSource(body);
  const status = pickStatus(body);
  const candidates = statusCandidatesForLog(body);
  const paid = isPaidStatus(status);

  console.info("[bePaid webhook] входящий запрос", {
    externalIdSource,
    externalIdPreview: idPreview(externalId ?? undefined),
    statusEffective: status,
    paid,
    statusCandidates: candidates,
  });

  if (!externalId) {
    console.warn("[bePaid webhook] нет externalId / token / tracking_id", {
      statusCandidates: candidates,
    });
    return new NextResponse("no id", { status: 400 });
  }

  if (!isPaidStatus(status)) {
    console.info("[bePaid webhook] статус не «оплачен», пропуск", {
      statusEffective: status,
      statusCandidates: candidates,
      hint:
        "Если оплата в ЛК bePaid успешна, а здесь ignored — пришлите этот блок логов; смотрим расхождение полей статуса.",
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  /** Идемпотентность без P2002 в логах: повторный вебхук от bePaid — норма. */
  const inserted = await prisma.webhookReceipt.createMany({
    data: [{ provider: "bepaid", externalId }],
    skipDuplicates: true,
  });
  if (inserted.count === 0) {
    console.info("[bePaid webhook] дубликат externalId (идемпотентность)", {
      externalIdSource,
      externalIdPreview: idPreview(externalId),
    });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const branches = orderLookupBranches(body);
  const where = orderWhereFromWebhook(body);
  const orLen = Array.isArray(where.OR) ? where.OR.length : 0;

  console.info("[bePaid webhook] поиск заказа", {
    externalIdSource,
    externalIdPreview: idPreview(externalId),
    orBranches: orLen,
    lookupBranches: branches,
  });

  const order = Object.keys(where).length
    ? await prisma.order.findFirst({ where })
    : null;
  if (!order) {
    console.warn("[bePaid webhook] заказ не найден по token/uid/tracking_id", {
      externalIdSource,
      externalIdPreview: idPreview(externalId),
      orBranches: orLen,
      lookupBranches: branches,
      hint: "В БД Order.bepaidUid должен совпасть с checkout token из создания платежа.",
    });
    return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  console.info("[bePaid webhook] найден заказ, fulfill", {
    orderId: order.id,
    orderStatus: order.status,
    bepaidUidPreview: idPreview(order.bepaidUid ?? undefined),
  });

  try {
    await fulfillPaidOrder(order.id);
  } catch (err) {
    console.error("[bePaid webhook] fulfillPaidOrder", {
      orderId: order.id,
      err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  console.info("[bePaid webhook] успешно обработан", { orderId: order.id });
  return NextResponse.json({ ok: true });
}
