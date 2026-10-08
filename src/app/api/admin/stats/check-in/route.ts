import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import {
  type CheckInStatsStatus,
  queryCheckInStats,
} from "@/lib/admin-check-in-stats";
import { parseOptionalSlotKind } from "@/lib/slot-kind";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

function parseStatus(raw: string | null): CheckInStatsStatus | null {
  const s = raw?.trim();
  if (!s || s === "all") return "all";
  if (s === "checked_in" || s === "visited") return "checked_in";
  if (s === "not_checked_in" || s === "not_visited") return "not_checked_in";
  return null;
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || null;
  const from = url.searchParams.get("from")?.trim() || null;
  const to = url.searchParams.get("to")?.trim() || null;
  if (!date && !from) {
    return jsonWithCors(
      req,
      { error: "BAD_REQUEST", message: "Укажите date=YYYY-MM-DD или from и to" },
      { status: 400 },
    );
  }

  const status = parseStatus(url.searchParams.get("status"));
  if (!status) {
    return jsonWithCors(
      req,
      { error: "BAD_REQUEST", message: "status: all | checked_in | not_checked_in" },
      { status: 400 },
    );
  }

  const slotId = url.searchParams.get("slotId")?.trim() || null;
  const slotKind = parseOptionalSlotKind(url.searchParams.get("kind"));
  const result = await queryCheckInStats({
    dateYmd: date,
    fromYmd: from,
    toYmd: to,
    slotId,
    slotKind,
    status,
  });
  if ("error" in result) {
    const message =
      result.error === "RANGE_TOO_LONG" ? "Период не длиннее 366 дней" : "Некорректная дата";
    return jsonWithCors(req, { error: "BAD_REQUEST", message }, { status: 400 });
  }

  return jsonWithCors(req, result);
}
