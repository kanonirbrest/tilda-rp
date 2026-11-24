import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getRequestOrigin } from "@/lib/request-origin";
import { getPrintTicketPublicView, PrintTicketError } from "@/lib/print-tickets";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t")?.trim() ?? "";
  if (token.length < 8) {
    return NextResponse.json(
      { error: "TOKEN_REQUIRED", hint: "Укажите код билета." },
      { status: 400 },
    );
  }
  try {
    const view = await getPrintTicketPublicView(token, getRequestOrigin(req));
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
      return NextResponse.json({ error: err.code, hint: err.message }, { status: 404 });
    }
    throw err;
  }
}
