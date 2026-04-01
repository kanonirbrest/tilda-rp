import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrderCheckout } from "@/lib/create-order-checkout";
import { prisma } from "@/lib/prisma";
import { getRequestOrigin } from "@/lib/request-origin";

const lineSchema = z.object({
  tier: z.enum(["ADULT", "CHILD", "CONCESSION"]),
  quantity: z.number().int().min(0),
});

const bodySchema = z.object({
  slotId: z.string().trim().min(1, "не выбран"),
  name: z.string().trim().min(1, "укажите имя").max(200),
  email: z.string().trim().email("некорректный email").max(320),
  phone: z
    .string()
    .trim()
    .min(6, "телефон слишком короткий")
    .max(40, "телефон слишком длинный"),
  lines: z.array(lineSchema).optional(),
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
  const lines = (parsed.data.lines ?? []).filter((l) => l.quantity > 0);

  const result = await createOrderCheckout(
    { slotId, name, email, phone, lines: lines.length ? lines : [{ tier: "ADULT", quantity: 1 }] },
    getRequestOrigin(req),
  );

  if (!result.ok) {
    if (result.status === 404) {
      return NextResponse.json({ error: "SLOT_NOT_FOUND" }, { status: 404 });
    }
    if (result.status === 400) {
      return NextResponse.json({ error: "INVALID_LINES", hint: result.message }, { status: 400 });
    }
    if (result.status === 409) {
      return NextResponse.json({ error: "CAPACITY_EXCEEDED", hint: result.message }, { status: 409 });
    }
    if (result.status === 503) {
      return NextResponse.json(
        {
          error: "PAYMENT_NOT_CONFIGURED",
          hint: result.hint ?? result.message,
        },
        { status: 503 },
      );
    }
    if (result.status === 502) {
      return NextResponse.json({ error: "PAYMENT_CREATE_FAILED" }, { status: 502 });
    }
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        hint: process.env.NODE_ENV === "development" ? result.message : undefined,
      },
      { status: 500 },
    );
  }

  let ticketToken: string | undefined;
  if (process.env.DEV_SKIP_PAYMENT === "true") {
    const t = await prisma.ticket.findUnique({
      where: { orderId: result.orderId },
      select: { publicToken: true },
    });
    ticketToken = t?.publicToken;
  }

  return NextResponse.json({
    orderId: result.orderId,
    ticketToken,
    redirectUrl: result.redirectUrl,
  });
}
