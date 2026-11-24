import { NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { CapacityExceededError } from "@/lib/create-order-checkout";
import { DEI_POLICY_CONSENT_ERROR } from "@/lib/policy-consent";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  PrintRegistrationClosedError,
  registerPrintTicket,
} from "@/lib/register-print-ticket";
import { getPrintTicketPublicView, PrintTicketError } from "@/lib/print-tickets";

const bodySchema = z.object({
  token: z.string().trim().min(8).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().trim().min(4).max(8),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().min(6).max(40),
  policyConsent: z.literal(true),
  marketingConsent: z.boolean().optional(),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON", hint: "Некорректное тело" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const policy = parsed.error.issues.some((i) => i.path[0] === "policyConsent");
    return NextResponse.json(
      {
        error: "VALIDATION",
        hint: policy ? DEI_POLICY_CONSENT_ERROR : "Проверьте имя, почту, телефон и выбранный сеанс.",
      },
      { status: 400 },
    );
  }

  try {
    await registerPrintTicket({
      ...parsed.data,
      baseUrl: getRequestOrigin(req),
    });
    const view = await getPrintTicketPublicView(parsed.data.token, getRequestOrigin(req));
    const qrDataUrl = await QRCode.toDataURL(view.qrUrl, {
      type: "image/png",
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    return NextResponse.json({ ...view, qrDataUrl });
  } catch (err) {
    if (err instanceof PrintTicketError) {
      const status =
        err.code === "ALREADY_REGISTERED" ? 409
        : err.code === "ALREADY_USED" ? 409
        : err.code === "NOT_FOUND" ? 404
        : 400;
      return NextResponse.json({ error: err.code, hint: err.message }, { status });
    }
    if (err instanceof PrintRegistrationClosedError) {
      return NextResponse.json({ error: "REGISTRATION_CLOSED", hint: err.message }, { status: 409 });
    }
    if (err instanceof CapacityExceededError) {
      return NextResponse.json(
        { error: "CAPACITY_EXCEEDED", hint: "На этот сеанс мест больше нет. Выберите другое время." },
        { status: 409 },
      );
    }
    console.error("[print-ticket] reserve", err);
    return NextResponse.json({ error: "RESERVE_FAILED", hint: "Не удалось зарезервировать. Попробуйте ещё раз." }, { status: 500 });
  }
}
