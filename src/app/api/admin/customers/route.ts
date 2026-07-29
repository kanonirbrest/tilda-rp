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

/**
 * Список пользователей (Customer) для страницы /users.
 * GET ?q=&title=&date=YYYY-MM-DD&page=1&limit=20
 * Фильтры title/date — покупатели с заказом на это мероприятие / дату сеанса.
 */
export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const title = (url.searchParams.get("title") ?? "").trim();
  const dateYmd = (url.searchParams.get("date") ?? "").trim();
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
    customers: rows.map((c) => {
      const fromBot = c.orders.some((o) => Boolean(o.clubPromoTelegramUserId?.trim()));
      const source = c._count.orders === 0 ? "anketa" : "tickets";
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        createdAt: formatDisplayDateTime(c.createdAt.toISOString()),
        createdAtIso: c.createdAt.toISOString(),
        ordersCount: c._count.orders,
        source,
        fromBot,
      };
    }),
  });
}
