import { NextResponse } from "next/server";
import { jsonPublicApiError } from "@/lib/public-api-error";
import { jsonPublicReadResponse, publicReadCorsHeaders } from "@/lib/public-orders-cors";
import { listGardensSessionsPublic } from "@/lib/gardens-of-dreams/ensure-slots";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: publicReadCorsHeaders(req) });
}

/**
 * Сеансы «Сады сновидений»: расписание из кода + авто-создание слотов в БД.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const hidePast =
      searchParams.get("hidePast") !== "0" &&
      searchParams.get("hidePast")?.toLowerCase() !== "false";
    const date = searchParams.get("date")?.trim() || undefined;

    const data = await listGardensSessionsPublic({ hidePast, date });
    return jsonPublicReadResponse(req, data, 200);
  } catch (err) {
    return jsonPublicApiError(req, err);
  }
}
