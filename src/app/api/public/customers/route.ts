import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonOrdersResponse, publicOrdersCorsHeaders } from "@/lib/public-orders-cors";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicOrdersCorsHeaders(req) });
}

const bodySchema = z.object({
  lastName: z.string().trim().min(1, "Укажите фамилию").max(100),
  firstName: z.string().trim().min(1, "Укажите имя").max(100),
  email: z.string().trim().email("Некорректный email").max(200),
  phone: z.string().trim().min(8, "Укажите телефон").max(32),
});

/**
 * Публичная анкета: создаёт запись Customer в той же таблице, что и покупатели билетов.
 * name = «Фамилия Имя».
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Некорректные данные";
      return jsonOrdersResponse(req, { error: "BAD_REQUEST", message: msg }, 400);
    }

    const lastName = parsed.data.lastName.replace(/\s+/g, " ");
    const firstName = parsed.data.firstName.replace(/\s+/g, " ");
    const email = parsed.data.email.toLowerCase();
    const phone = parsed.data.phone.replace(/\s+/g, " ");
    const name = `${lastName} ${firstName}`.trim();

    const customer = await prisma.customer.create({
      data: { name, email, phone },
      select: { id: true, name: true, email: true, phone: true, createdAt: true },
    });

    return jsonOrdersResponse(
      req,
      {
        ok: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          createdAt: customer.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
