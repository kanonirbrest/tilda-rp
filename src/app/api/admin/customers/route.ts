import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { adminCorsHeaders, jsonWithCors, requireAdmin } from "@/lib/admin-api";
import { dateKeyInTz, getExhibitionTimezone, wallDayUtcRange } from "@/lib/exhibition-time";
import { formatDisplayDateTime } from "@/lib/format-display-datetime";

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: adminCorsHeaders(req) });
}

async function customerFilterFacets(
  tz: string,
  title: string | null,
  dateYmd: string | null,
): Promise<{ titles: string[]; dates: string[] }> {
  const [titleSlots, dateSlots] = await Promise.all([
    prisma.slot.findMany({
      where: {
        orders: { some: {} },
        ...(dateYmd ?
          (() => {
            const range = wallDayUtcRange(dateYmd, tz);
            return range ? { startsAt: { gte: range.start, lte: range.end } } : {};
          })()
        : {}),
      },
      select: { title: true },
      distinct: ["title"],
      orderBy: { title: "asc" },
    }),
    prisma.slot.findMany({
      where: {
        orders: { some: {} },
        ...(title ? { title } : {}),
      },
      select: { startsAt: true },
    }),
  ]);

  const dates = new Set<string>();
  for (const s of dateSlots) {
    dates.add(dateKeyInTz(s.startsAt, tz));
  }

  return {
    titles: titleSlots.map((s) => s.title),
    dates: [...dates].sort().reverse(),
  };
}

async function customerIdsWithMinOrders(minOrders: number): Promise<string[]> {
  if (minOrders <= 0) return [];
  const groups = await prisma.order.groupBy({
    by: ["customerId"],
    _count: { _all: true },
    having: {
      customerId: {
        _count: { gte: minOrders },
      },
    },
  });
  return groups.map((g) => g.customerId);
}

/**
 * Список пользователей (Customer) для страницы /users.
 * GET ?q=&title=&date=YYYY-MM-DD&minOrders=&page=1&limit=20
 * minOrders: 0 = без заказов; 1/2/3… = не меньше N заказов.
 * Фильтры title/date — покупатели с заказом на это мероприятие / дату сеанса.
 */
export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const title = (url.searchParams.get("title") ?? "").trim();
  const dateYmd = (url.searchParams.get("date") ?? "").trim();
  const minOrdersRaw = (url.searchParams.get("minOrders") ?? "").trim();
  const minOrders =
    minOrdersRaw === "" ? null
    : Number.isFinite(Number.parseInt(minOrdersRaw, 10)) ?
      Math.max(0, Number.parseInt(minOrdersRaw, 10))
    : null;
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;
  const tz = getExhibitionTimezone();

  const and: Prisma.CustomerWhereInput[] = [];

  if (q.length > 0) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (title || dateYmd) {
    const slotWhere: Prisma.SlotWhereInput = {};
    if (title) slotWhere.title = title;
    if (dateYmd) {
      const range = wallDayUtcRange(dateYmd, tz);
      if (!range) {
        return jsonWithCors(req, { message: "date: ожидается YYYY-MM-DD" }, { status: 400 });
      }
      slotWhere.startsAt = { gte: range.start, lte: range.end };
    }
    and.push({
      orders: {
        some: { slot: slotWhere },
      },
    });
  }

  if (minOrders === 0) {
    and.push({ orders: { none: {} } });
  } else if (minOrders != null && minOrders >= 1) {
    if (minOrders === 1) {
      and.push({ orders: { some: {} } });
    } else {
      const ids = await customerIdsWithMinOrders(minOrders);
      if (ids.length === 0) {
        return jsonWithCors(req, {
          total: 0,
          page,
          limit,
          totalPages: 1,
          facets: await customerFilterFacets(tz, title || null, dateYmd || null),
          customers: [],
          minOrders,
        });
      }
      and.push({ id: { in: ids } });
    }
  }

  const where: Prisma.CustomerWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, rows, facets] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        birthDate: true,
        createdAt: true,
        _count: { select: { orders: true } },
        orders: {
          where: { clubPromoTelegramUserId: { not: null } },
          select: { clubPromoTelegramUserId: true },
          take: 1,
        },
      },
    }),
    customerFilterFacets(tz, title || null, dateYmd || null),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return jsonWithCors(req, {
    total,
    page,
    limit,
    totalPages,
    facets,
    minOrders,
    customers: rows.map((c) => {
      const fromBot = c.orders.some((o) => Boolean(o.clubPromoTelegramUserId?.trim()));
      const source = c._count.orders === 0 ? "anketa" : "tickets";
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        birthDate: c.birthDate ? c.birthDate.toISOString().slice(0, 10) : null,
        createdAt: formatDisplayDateTime(c.createdAt.toISOString()),
        createdAtIso: c.createdAt.toISOString(),
        ordersCount: c._count.orders,
        source,
        fromBot,
      };
    }),
  });
}
