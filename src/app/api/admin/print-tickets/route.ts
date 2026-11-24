import { z } from "zod";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  PRINT_TICKET_ISSUE_MAX,
  issuePrintTickets,
  listPrintTickets,
  PrintTicketError,
} from "@/lib/print-tickets";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const data = await listPrintTickets({ q, limit, offset });
  return jsonWithCors(req, data);
}

const issueBody = z.object({
  count: z.number().int().min(1).max(PRINT_TICKET_ISSUE_MAX),
  tier: z.enum(["ADULT", "CHILD"]),
});

export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonWithCors(req, { error: "BAD_JSON", message: "Некорректное тело" }, { status: 400 });
  }
  const parsed = issueBody.safeParse(json);
  if (!parsed.success) {
    return jsonWithCors(
      req,
      {
        error: "BAD_COUNT",
        message: `Укажите количество от 1 до ${PRINT_TICKET_ISSUE_MAX} и тип: взрослый или детский.`,
      },
      { status: 400 },
    );
  }
  try {
    const issued = await issuePrintTickets({
      count: parsed.data.count,
      tier: parsed.data.tier,
      baseUrl: getRequestOrigin(req),
    });
    return jsonWithCors(req, issued, { status: 201 });
  } catch (err) {
    if (err instanceof PrintTicketError) {
      return jsonWithCors(req, { error: err.code, message: err.message }, { status: 400 });
    }
    console.error("[print-ticket] issue", err);
    return jsonWithCors(req, { error: "ISSUE_FAILED", message: "Не удалось создать билеты." }, { status: 500 });
  }
}
