import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createPublicTicketToken } from "@/lib/ticket-token";
import { createBepaidPayment } from "@/lib/bepaid";
import { fulfillPaidOrder } from "@/lib/fulfill-order";
import { getRequestOrigin } from "@/lib/request-origin";

const bodySchema = z.object({
  slotId: z.string().trim().min(1, "не выбран"),
  name: z.string().trim().min(1, "укажите имя").max(200),
  email: z.string().trim().email("некорректный email").max(320),
  phone: z
    .string()
    .trim()
    .min(6, "телефон слишком короткий")
    .max(40, "телефон слишком длинный"),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "VALIDATION", details: parsed.error.flatten() }, { status: 400 });
  }

  const { slotId, name, email, phone } = parsed.data;

  try {
    const slot = await prisma.slot.findFirst({
      where: { id: slotId, active: true },
    });
    if (!slot) {
      return NextResponse.json({ error: "SLOT_NOT_FOUND" }, { status: 404 });
    }

    const skipPayment = process.env.DEV_SKIP_PAYMENT === "true";

    const order = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: { name, email: email.trim().toLowerCase(), phone },
      });
      const o = await tx.order.create({
        data: {
          slotId: slot.id,
          customerId: customer.id,
          amountCents: slot.priceCents,
          currency: slot.currency,
          status: "PENDING",
        },
      });
      await tx.ticket.create({
        data: {
          orderId: o.id,
          publicToken: createPublicTicketToken(),
        },
      });
      return o.id;
    });

    if (skipPayment) {
      await fulfillPaidOrder(order);
      const ticket = await prisma.ticket.findUnique({
        where: { orderId: order },
        select: { publicToken: true },
      });
      return NextResponse.json({
        orderId: order,
        ticketToken: ticket?.publicToken,
        redirectUrl: `/success?orderId=${encodeURIComponent(order)}`,
      });
    }

    try {
      const pay = await createBepaidPayment({
        orderId: order,
        amountCents: slot.priceCents,
        currency: slot.currency,
        description: `${slot.title} — ${slot.startsAt.toISOString()}`,
        customerEmail: email.trim(),
        publicBaseUrl: getRequestOrigin(req),
      });
      await prisma.order.update({
        where: { id: order },
        data: { bepaidUid: pay.bepaidUid },
      });
      return NextResponse.json({
        orderId: order,
        redirectUrl: pay.redirectUrl,
      });
    } catch (e) {
      if (e instanceof Error && e.message === "BEPAID_NOT_CONFIGURED") {
        return NextResponse.json(
          {
            error: "PAYMENT_NOT_CONFIGURED",
            hint: "Укажите BEPAID_SHOP_ID и BEPAID_SECRET_KEY или включите DEV_SKIP_PAYMENT=true для локальных тестов.",
          },
          { status: 503 },
        );
      }
      console.error(e);
      return NextResponse.json({ error: "PAYMENT_CREATE_FAILED" }, { status: 502 });
    }
  } catch (e) {
    console.error("POST /api/orders", e);
    const msg = e instanceof Error ? e.message : String(e);
    const dbHint =
      /connect|ECONNREFUSED|P1001|database/i.test(msg) ?
        " Не удаётся подключиться к PostgreSQL: выполните в папке проекта `docker compose up -d` и проверьте DATABASE_URL в .env."
      : "";
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        hint:
          process.env.NODE_ENV === "development" ?
            `${msg}${dbHint}`
          : `Сервер временно недоступен.${dbHint}`,
      },
      { status: 500 },
    );
  }
}
