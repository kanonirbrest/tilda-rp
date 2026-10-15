import { z } from "zod";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { prisma } from "@/lib/prisma";
import { SeatUnavailableError } from "@/lib/seat-checkout-errors";
import { VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";
import { findVivaldiOccupiedSeatKeys, vivaldiSeatSaleOverridesForSlot } from "@/lib/vivaldi/ensure-slots";
import {
  findVivaldiComplimentarySeatKeys,
  issueVivaldiComplimentarySeat,
} from "@/lib/vivaldi/issue-complimentary";
import { buildVivaldiSeatMapWithOverrides } from "@/lib/vivaldi/seat-map";
import { vivaldiDateForStartsAt } from "@/lib/vivaldi/schedule";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

async function loadMap(slot: { id: string; startsAt: Date; seatSaleOverrides: import("@prisma/client").Prisma.JsonValue | null }) {
  const date = vivaldiDateForStartsAt(slot.startsAt);
  const overrides = vivaldiSeatSaleOverridesForSlot(slot);
  const [occupied, complimentary] = await Promise.all([
    findVivaldiOccupiedSeatKeys(slot.id),
    findVivaldiComplimentarySeatKeys(slot.id),
  ]);
  return {
    seats: buildVivaldiSeatMapWithOverrides(date, overrides),
    occupied,
    complimentary,
    overrides,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }
  if (slot.kind !== VIVALDI_CONCERT_SLOT_KIND) {
    return jsonWithCors(
      req,
      { error: "WRONG_SLOT_KIND", message: "Пригласительные только для «Времена года»" },
      { status: 400 },
    );
  }

  const map = await loadMap(slot);
  return jsonWithCors(req, { slotId: slot.id, title: slot.title, ...map });
}

const bodySchema = z.object({
  seatKey: z.string().min(3).max(16),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  deliver: z.enum(["email", "download"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.kind !== VIVALDI_CONCERT_SLOT_KIND) {
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
    const issued = await issueVivaldiComplimentarySeat(slot.id, parsed.data.seatKey, parsed.data);
    const map = await loadMap(slot);
    return jsonWithCors(req, {
      slotId: slot.id,
      title: slot.title,
      ...map,
      issued,
    });
  } catch (e) {
    if (e instanceof SeatUnavailableError) {
      return jsonWithCors(
        req,
        { error: "SEAT_TAKEN", message: "Место уже занято" },
        { status: 409 },
      );
    }
    const message = e instanceof Error ? e.message : "Не удалось выдать билет";
    return jsonWithCors(req, { error: "ISSUE_FAILED", message }, { status: 400 });
  }
}
