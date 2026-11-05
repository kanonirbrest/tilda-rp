import { z } from "zod";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { prisma } from "@/lib/prisma";
import { DOM_ROZHDESTVA_SLOT_KIND } from "@/lib/slot-kind";
import {
  DomInviteCapacityError,
  issueDomRozhdestvaInvite,
} from "@/lib/dom-rozhdestva/issue-complimentary";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

const bodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  deliver: z.enum(["email", "download"]),
});

/** Пригласительный «Дом Рождества» (без оплаты): POST /api/admin/slots/[id]/invite */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.kind !== DOM_ROZHDESTVA_SLOT_KIND) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonWithCors(req, { error: "BAD_JSON", message: "Некорректное тело" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonWithCors(
      req,
      { error: "BAD_CONTACT", message: "Укажите имя. Для письма ещё нужны почта и телефон." },
      { status: 400 },
    );
  }
  if (
    parsed.data.deliver === "email" &&
    (!z.string().email().safeParse(parsed.data.email).success || parsed.data.phone.length < 5)
  ) {
    return jsonWithCors(
      req,
      { error: "BAD_CONTACT", message: "Для письма укажите почту и телефон" },
      { status: 400 },
    );
  }

  try {
    const issued = await issueDomRozhdestvaInvite(slot.id, parsed.data);
    return jsonWithCors(req, { slotId: slot.id, title: slot.title, issued });
  } catch (e) {
    if (e instanceof DomInviteCapacityError) {
      return jsonWithCors(req, { error: "SOLD_OUT", message: e.message }, { status: 409 });
    }
    const message = e instanceof Error ? e.message : "Не удалось выдать билет";
    return jsonWithCors(req, { error: "ISSUE_FAILED", message }, { status: 400 });
  }
}
