import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fulfillPaidOrder } from "@/lib/fulfill-order";

function pickUid(body: Record<string, unknown>): string | undefined {
  const payment = body.payment as Record<string, unknown> | undefined;
  const transaction = body.transaction as Record<string, unknown> | undefined;
  return (
    (payment?.uid as string | undefined) ||
    (transaction?.uid as string | undefined) ||
    (body.uid as string | undefined)
  );
}

function pickStatus(body: Record<string, unknown>): string | undefined {
  const payment = body.payment as Record<string, unknown> | undefined;
  const transaction = body.transaction as Record<string, unknown> | undefined;
  return (
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
    return new NextResponse("bad json", { status: 400 });
  }

  const uid = pickUid(body);
  if (!uid) {
    return new NextResponse("no uid", { status: 400 });
  }

  if (!isPaidStatus(pickStatus(body))) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    await prisma.webhookReceipt.create({
      data: { provider: "bepaid", externalId: uid },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    throw e;
  }

  const order = await prisma.order.findFirst({
    where: { bepaidUid: uid },
  });
  if (!order) {
    return NextResponse.json({ ok: false, error: "ORDER_NOT_FOUND" }, { status: 404 });
  }

  try {
    await fulfillPaidOrder(order.id);
  } catch (err) {
    console.error("fulfillPaidOrder", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
