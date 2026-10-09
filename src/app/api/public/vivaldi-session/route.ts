import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { getVivaldiSessionPublic } from "@/lib/vivaldi/ensure-slots";
import { VIVALDI_PERFORMANCE } from "@/lib/vivaldi/schedule";
import { NextResponse } from "next/server";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/** Сеанс «Времена года. Антонио Вивальди»: расписание из кода и слот в БД. */
export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date")?.trim() || VIVALDI_PERFORMANCE.date;
    const data = await getVivaldiSessionPublic(date);
    return jsonPublicReadResponse(req, data, 200);
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
