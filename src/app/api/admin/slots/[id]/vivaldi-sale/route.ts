import { Prisma } from "@prisma/client";
import { z } from "zod";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { prisma } from "@/lib/prisma";
import { VIVALDI_CONCERT_SLOT_KIND } from "@/lib/slot-kind";
import { findVivaldiOccupiedSeatKeys, vivaldiSeatSaleOverridesForSlot } from "@/lib/vivaldi/ensure-slots";
import {
  buildVivaldiSeatMapWithOverrides,
  countVivaldiSelectableSeatsWithOverrides,
  getVivaldiSeat,
} from "@/lib/vivaldi/seat-map";
import {
  isValidVivaldiSeatKey,
  type VivaldiSeatSaleOverrides,
} from "@/lib/vivaldi/seat-sale-overrides";
import { vivaldiDateForStartsAt } from "@/lib/vivaldi/schedule";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

function nextOverrides(
  baseSelectable: boolean,
  current: VivaldiSeatSaleOverrides,
  seatKey: string,
  wantOnSale: boolean,
): VivaldiSeatSaleOverrides {
  const next = { ...current };
  if (wantOnSale === baseSelectable) delete next[seatKey];
  else next[seatKey] = wantOnSale;
  return next;
}

const patchBody = z.object({
  toggles: z
    .array(
      z.object({
        seatKey: z.string().min(3).max(16),
        onSale: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  let body: z.infer<typeof patchBody>;
  try {
    body = patchBody.parse(await req.json());
  } catch {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: "Некорректный запрос" }, { status: 400 });
  }

  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.kind !== VIVALDI_CONCERT_SLOT_KIND) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }

  const date = vivaldiDateForStartsAt(slot.startsAt);
  let overrides = vivaldiSeatSaleOverridesForSlot(slot);
  const occupied = new Set(await findVivaldiOccupiedSeatKeys(slot.id));

  for (const toggle of body.toggles) {
    const key = toggle.seatKey.trim();
    if (!isValidVivaldiSeatKey(key)) {
      return jsonWithCors(req, { error: "BAD_SEAT_KEY", message: `Некорректное место: ${key}` }, { status: 400 });
    }
    const base = getVivaldiSeat(key, date);
    if (!base) {
      return jsonWithCors(req, { error: "UNKNOWN_SEAT", message: `Места нет на схеме: ${key}` }, { status: 400 });
    }
    if (!toggle.onSale && occupied.has(key)) {
      return jsonWithCors(
        req,
        { error: "SEAT_OCCUPIED", message: `${base.label} уже занято — снять с продажи нельзя` },
        { status: 409 },
      );
    }
    const draft = nextOverrides(base.selectable, overrides, key, toggle.onSale);
    const opened = buildVivaldiSeatMapWithOverrides(date, draft).find((seat) => seat.key === key);
    if (toggle.onSale && !opened?.selectable) {
      return jsonWithCors(
        req,
        { error: "NO_PRICE", message: `${base.label} нельзя открыть: у места нет цены` },
        { status: 400 },
      );
    }
    overrides = draft;
  }

  await prisma.slot.update({
    where: { id },
    data: {
      seatSaleOverrides:
        Object.keys(overrides).length === 0 ? Prisma.DbNull : (overrides as Prisma.InputJsonValue),
      capacity: countVivaldiSelectableSeatsWithOverrides(date, overrides),
    },
  });

  return jsonWithCors(req, { ok: true, overrides });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot || slot.kind !== VIVALDI_CONCERT_SLOT_KIND) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }

  const date = vivaldiDateForStartsAt(slot.startsAt);
  await prisma.slot.update({
    where: { id },
    data: {
      seatSaleOverrides: Prisma.DbNull,
      capacity: countVivaldiSelectableSeatsWithOverrides(date, null),
    },
  });

  return jsonWithCors(req, { ok: true, overrides: {} });
}
