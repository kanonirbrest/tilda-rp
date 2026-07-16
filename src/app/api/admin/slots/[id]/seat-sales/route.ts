import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import {
  findGardensOccupiedSeatKeys,
  gardensSeatMapVariantForSlot,
  gardensSeatSaleOverridesForSlot,
} from "@/lib/gardens-of-dreams/ensure-slots";
import {
  buildGardensSeatMap,
  buildGardensSeatMapWithOverrides,
  getGardensSeat,
} from "@/lib/gardens-of-dreams/seat-map";
import {
  isValidGardensSeatKey,
  parseGardensSeatSaleOverrides,
  type GardensSeatSaleOverrides,
} from "@/lib/gardens-of-dreams/seat-sale-overrides";
import { GARDENS_OF_DREAMS_SLOT_KIND } from "@/lib/slot-kind";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

function nextOverridesAfterToggle(
  baseSelectable: boolean,
  current: GardensSeatSaleOverrides,
  seatKey: string,
  wantOnSale: boolean,
): GardensSeatSaleOverrides {
  const next = { ...current };
  if (wantOnSale === baseSelectable) {
    delete next[seatKey];
  } else {
    next[seatKey] = wantOnSale;
  }
  return next;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }
  if (slot.kind !== GARDENS_OF_DREAMS_SLOT_KIND) {
    return jsonWithCors(
      req,
      { error: "WRONG_SLOT_KIND", message: "Управление местами только для «Сады сновидений»" },
      { status: 400 },
    );
  }

  const variant = gardensSeatMapVariantForSlot(slot);
  const overrides = gardensSeatSaleOverridesForSlot(slot);
  const seats = buildGardensSeatMapWithOverrides(variant, overrides);
  /** Все занятые места (не только сейчас selectable) — чтобы админ видел бронь. */
  const occupied = await findGardensOccupiedSeatKeys(slot.id);
  const onSaleCount = seats.filter((s) => s.selectable).length;

  return jsonWithCors(req, {
    slotId: slot.id,
    title: slot.title,
    variant,
    overrides,
    seats,
    occupied,
    onSaleCount,
    currency: slot.currency,
  });
}

const patchBody = z.object({
  /** Выставить / снять конкретные места. */
  toggles: z
    .array(
      z.object({
        seatKey: z.string().min(3).max(16),
        onSale: z.boolean(),
      }),
    )
    .min(1)
    .max(200),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  let body: z.infer<typeof patchBody>;
  try {
    body = patchBody.parse(await req.json());
  } catch (e) {
    return jsonWithCors(req, { error: "BAD_REQUEST", message: String(e) }, { status: 400 });
  }

  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }
  if (slot.kind !== GARDENS_OF_DREAMS_SLOT_KIND) {
    return jsonWithCors(
      req,
      { error: "WRONG_SLOT_KIND", message: "Управление местами только для «Сады сновидений»" },
      { status: 400 },
    );
  }

  const variant = gardensSeatMapVariantForSlot(slot);
  let overrides = gardensSeatSaleOverridesForSlot(slot);
  const occupied = new Set(await findGardensOccupiedSeatKeys(slot.id));

  for (const t of body.toggles) {
    const key = t.seatKey.trim();
    if (!isValidGardensSeatKey(key)) {
      return jsonWithCors(
        req,
        { error: "BAD_SEAT_KEY", message: `Некорректный ключ места: ${key}` },
        { status: 400 },
      );
    }
    const base = getGardensSeat(key, variant);
    if (!base) {
      return jsonWithCors(
        req,
        { error: "UNKNOWN_SEAT", message: `Места нет на схеме: ${key}` },
        { status: 400 },
      );
    }
    if (!t.onSale && occupied.has(key)) {
      return jsonWithCors(
        req,
        {
          error: "SEAT_OCCUPIED",
          message: `Место ${base.label} уже занято заявкой — нельзя снять с продажи`,
        },
        { status: 409 },
      );
    }
    if (t.onSale && !base.selectable) {
      // включаем место, которого не было в базовой схеме — ок
    }
    overrides = nextOverridesAfterToggle(base.selectable, overrides, key, t.onSale);
  }

  const data: Prisma.SlotUpdateInput = {
    seatSaleOverrides:
      Object.keys(overrides).length === 0 ? Prisma.DbNull : (overrides as Prisma.InputJsonValue),
  };

  await prisma.slot.update({ where: { id }, data });

  const seats = buildGardensSeatMapWithOverrides(variant, overrides);
  const occupiedNow = await findGardensOccupiedSeatKeys(slot.id);

  return jsonWithCors(req, {
    ok: true,
    slotId: slot.id,
    overrides,
    seats,
    occupied: occupiedNow,
    onSaleCount: seats.filter((s) => s.selectable).length,
    /** Базовая схема без оверрайдов — для справки в UI. */
    baseOnSaleCount: buildGardensSeatMap(variant).filter((s) => s.selectable).length,
  });
}

/** Сброс всех ручных оверрайдов к схеме из кода. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const { id } = await ctx.params;
  const slot = await prisma.slot.findUnique({ where: { id } });
  if (!slot) {
    return jsonWithCors(req, { error: "NOT_FOUND", message: "Сеанс не найден" }, { status: 404 });
  }
  if (slot.kind !== GARDENS_OF_DREAMS_SLOT_KIND) {
    return jsonWithCors(
      req,
      { error: "WRONG_SLOT_KIND", message: "Управление местами только для «Сады сновидений»" },
      { status: 400 },
    );
  }

  await prisma.slot.update({
    where: { id },
    data: { seatSaleOverrides: Prisma.DbNull },
  });

  const variant = gardensSeatMapVariantForSlot(slot);
  const seats = buildGardensSeatMap(variant);
  const occupied = await findGardensOccupiedSeatKeys(slot.id);

  return jsonWithCors(req, {
    ok: true,
    overrides: parseGardensSeatSaleOverrides(null),
    seats,
    occupied,
    onSaleCount: seats.filter((s) => s.selectable).length,
  });
}
