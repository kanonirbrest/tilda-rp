import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fulfillPaidOrder } from "@/lib/fulfill-order";

/** Идемпотентность вебхука: стабильный внешний id */
function pickWebhookExternalId(body: Record<string, unknown>): string | undefined {
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txUid = (transaction?.uid ?? transaction?.id) as string | undefined;
  const token = typeof body.token === "string" ? body.token : undefined;
  const orderBlock = body.order as Record<string, unknown> | undefined;
  const tracking =
    typeof orderBlock?.tracking_id === "string" ? orderBlock.tracking_id : undefined;
  return txUid || token || tracking || (body.uid as string | undefined);
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
  return or.length ? { OR: or } : {};
}

function pickStatus(body: Record<string, unknown>): string | undefined {
  const payment = body.payment as Record<string, unknown> | undefined;
  const transaction = body.transaction as Record<string, unknown> | undefined;
  const txPayment = transaction?.payment as Record<string, unknown> | undefined;
  return (
    (txPayment?.status as string | undefined) ||
    (payment?.status as string | undefined) ||
    (transaction?.status as string | undefined) ||
    (body.status as string | undefined)
  );
}

function isPaidStatus(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "successful" || s === "success" || s === "paid" || s === "completed";
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    console.warn("[bePaid webhook] невалидный JSON");
    return new NextResponse("bad json", { status: 400 });
  }

  const externalId = pickWebhookExternalId(body);
  const status = pickStatus(body);
  console.info("[bePaid webhook] входящий запрос", {
    topLevelKeys: Object.keys(body),
    externalIdPreview: externalId ? `${externalId.slice(0, 8)}…` : null,
    status,
    paid: isPaidStatus(status),
  });

  if (!externalId) {
    console.warn("[bePaid webhook] нет externalId / token / tracking_id");
    return new NextResponse("no id", { status: 400 });
  }

  if (!isPaidStatus(status)) {
    console.info("[bePaid webhook] статус не «оплачен», пропуск", { status });
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await prisma.webhookReceipt.create({
      data: { provider: "bepaid", externalId },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      console.info("[bePaid webhook] дубликат externalId (идемпотентность)", {
        externalIdPreview: `${externalId.slice(0, 8)}…`,
      });
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  const where = orderWhereFromWebhook(body);
  const order = Object.keys(where).length
    ? await prisma.order.findFirst({ where })
    : null;
  if (!order) {
    const orLen = Array.isArray(where.OR) ? where.OR.length : 0;
    console.warn("[bePaid webhook] заказ не найден по token/uid/tracking_id", {
      externalIdPreview: `${externalId.slice(0, 8)}…`,
      orBranches: orLen,
    });
    return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  console.info("[bePaid webhook] найден заказ, fulfill", { orderId: order.id });

  try {
    await fulfillPaidOrder(order.id);
  } catch (err) {
    console.error("[bePaid webhook] fulfillPaidOrder", { orderId: order.id, err });
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  console.info("[bePaid webhook] успешно обработан", { orderId: order.id });
  return NextResponse.json({ ok: true });
}
