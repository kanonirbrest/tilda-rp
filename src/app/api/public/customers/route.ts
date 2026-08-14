import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findOrCreateCustomerByEmail } from "@/lib/customer-upsert";
import { parseBirthDate } from "@/lib/birth-date";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonOrdersResponse, publicOrdersCorsHeaders } from "@/lib/public-orders-cors";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicOrdersCorsHeaders(req) });
}

const bodySchema = z.object({
  firstName: z.string().trim().min(1, "Укажите имя").max(100),
  birthDate: z.string().trim().min(1, "Укажите дату рождения"),
  email: z.string().trim().email("Некорректный email").max(200),
  phone: z.string().trim().min(8, "Укажите телефон").max(32),
  policyConsent: z.boolean().refine((v) => v === true, {
    message: "Нужно дать согласие на обработку персональных данных",
  }),
});

/**
 * Публичная анкета: создаёт/обновляет Customer (по email) в той же таблице, что и покупатели билетов.
 * name = имя; birthDate — дата рождения.
 */
export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Некорректные данные";
      return jsonOrdersResponse(req, { error: "BAD_REQUEST", message: msg }, 400);
    }

    const birthDate = parseBirthDate(parsed.data.birthDate);
    if (!birthDate) {
      return jsonOrdersResponse(
        req,
        { error: "BAD_REQUEST", message: "Некорректная дата рождения" },
        400,
      );
    }

    const firstName = parsed.data.firstName.replace(/\s+/g, " ");
    const email = parsed.data.email.toLowerCase();
    const phone = parsed.data.phone.replace(/\s+/g, " ");

    const { id } = await findOrCreateCustomerByEmail(prisma, {
      name: firstName,
      email,
      phone,
      birthDate,
    });
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, email: true, phone: true, birthDate: true, createdAt: true },
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
          birthDate: customer.birthDate?.toISOString().slice(0, 10) ?? null,
          createdAt: customer.createdAt.toISOString(),
        },
      },
      201,
    );
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
