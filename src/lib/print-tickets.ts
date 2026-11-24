import { Prisma, type TicketTier } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPublicAppBaseUrl } from "@/lib/request-origin";
import {
  dateKeyInTz,
  formatDateKeyRu,
  getExhibitionTimezone,
  timeKeyInTz,
} from "@/lib/exhibition-time";
import {
  createPrintTicketToken,
  formatPrintSerial,
  formatPrintTicketToken,
  PRINT_TICKET_ISSUE_MAX,
  PRINT_TICKET_ISSUE_MIN,
  printTicketQrUrl,
  ticketTokenLookupCandidates,
} from "@/lib/print-ticket-token";

export { PRINT_TICKET_ISSUE_MAX, PRINT_TICKET_ISSUE_MIN };

export const PRINT_TICKET_TIERS = ["ADULT", "CHILD"] as const;
export type PrintTicketTier = (typeof PRINT_TICKET_TIERS)[number];

export function isPrintTicketTier(value: unknown): value is PrintTicketTier {
  return value === "ADULT" || value === "CHILD";
}

export function printTicketTierFromStored(tier: TicketTier | null | undefined): PrintTicketTier {
  return tier === "CHILD" ? "CHILD" : "ADULT";
}

export function printTicketTierLabelRu(tier: TicketTier | null | undefined): string {
  return printTicketTierFromStored(tier) === "CHILD" ? "Детский" : "Взрослый";
}

/** Подпись на печатном бланке. */
export function printTicketSheetTierLabel(tier: TicketTier | null | undefined): string {
  return printTicketTierFromStored(tier) === "CHILD" ? "ДЕТСКИЙ (3-11 ЛЕТ)" : "ВЗРОСЛЫЙ";
}

/** Печатный билет без активной брони: ещё не регистрировали или бронь сняли. */
export function isPrintTicketAwaitingRegistration(ticket: {
  source: string;
  order: { status: string } | null;
}): boolean {
  return ticket.source === "PRINT" && (!ticket.order || ticket.order.status !== "PAID");
}

function printReservationActive(ticket: {
  refundedAt: Date | null;
  order: { status: string } | null;
}): boolean {
  return Boolean(ticket.order && ticket.order.status === "PAID" && !ticket.refundedAt);
}

export class PrintTicketError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "NOT_PRINT"
      | "NOT_REGISTERED"
      | "ALREADY_REGISTERED"
      | "ALREADY_USED"
      | "BAD_COUNT",
    message: string,
  ) {
    super(message);
    this.name = "PrintTicketError";
  }
}

const ticketScanInclude = {
  order: { include: { customer: true, slot: true } },
} satisfies Prisma.TicketInclude;

export type TicketForScan = Prisma.TicketGetPayload<{ include: typeof ticketScanInclude }>;

export async function findTicketByScannedToken(raw: string): Promise<TicketForScan | null> {
  const candidates = ticketTokenLookupCandidates(raw);
  if (candidates.length === 0) return null;
  return prisma.ticket.findFirst({
    where: { publicToken: { in: candidates } },
    include: ticketScanInclude,
  });
}

export type PrintTicketPublicStatus = "unregistered" | "registered" | "used";

export type PrintTicketPublicView = {
  status: PrintTicketPublicStatus;
  serial: number;
  serialLabel: string;
  displayCode: string;
  qrUrl: string;
  tier: PrintTicketTier;
  tierLabel: string;
  reservation: {
    dateKey: string;
    dateLabel: string;
    timeKey: string;
    title: string;
    customerName: string;
    email: string;
  } | null;
};

function publicViewFromTicket(
  ticket: TicketForScan,
  baseUrl: string,
): PrintTicketPublicView | null {
  if (ticket.source !== "PRINT" || ticket.serial == null) return null;
  const order = ticket.order;
  const registered = printReservationActive(ticket);
  const tz = getExhibitionTimezone();
  const tier = printTicketTierFromStored(ticket.tier);
  return {
    status: ticket.usedAt ? "used" : registered ? "registered" : "unregistered",
    serial: ticket.serial,
    serialLabel: formatPrintSerial(ticket.serial),
    displayCode: formatPrintTicketToken(ticket.publicToken),
    qrUrl: printTicketQrUrl(baseUrl, ticket.publicToken),
    tier,
    tierLabel: printTicketTierLabelRu(tier),
    reservation:
      registered && order ?
        {
          dateKey: dateKeyInTz(order.slot.startsAt, tz),
          dateLabel: formatDateKeyRu(dateKeyInTz(order.slot.startsAt, tz)),
          timeKey: timeKeyInTz(order.slot.startsAt, tz),
          title: order.slot.title,
          customerName: order.customer.name,
          email: order.customer.email,
        }
      : null,
  };
}

export async function getPrintTicketPublicView(
  rawToken: string,
  baseUrl: string = getPublicAppBaseUrl(),
): Promise<PrintTicketPublicView> {
  const ticket = await findTicketByScannedToken(rawToken);
  const view = ticket ? publicViewFromTicket(ticket, baseUrl) : null;
  if (!view) {
    throw new PrintTicketError("NOT_FOUND", "Билет не найден. Проверьте уникальный код.");
  }
  return view;
}

async function uniquePrintTokens(count: number): Promise<string[]> {
  const tokens = new Set<string>();
  let guard = 0;
  while (tokens.size < count && guard < count * 8 + 40) {
    tokens.add(createPrintTicketToken());
    guard++;
  }
  if (tokens.size < count) {
    throw new Error("Не удалось сгенерировать уникальные коды билетов");
  }
  const list = [...tokens];
  const existing = await prisma.ticket.findMany({
    where: { publicToken: { in: list } },
    select: { publicToken: true },
  });
  if (existing.length === 0) return list;
  const taken = new Set(existing.map((t) => t.publicToken));
  const fresh = list.filter((t) => !taken.has(t));
  const extra = await uniquePrintTokens(count - fresh.length);
  return [...fresh, ...extra].slice(0, count);
}

export type IssuedPrintTicket = {
  id: string;
  serial: number;
  serialLabel: string;
  publicToken: string;
  displayCode: string;
  qrUrl: string;
  tier: PrintTicketTier;
};

function toIssuedPrintTicket(
  t: { id: string; serial: number | null; publicToken: string; tier: TicketTier | null },
  baseUrl: string,
): IssuedPrintTicket {
  const serial = t.serial ?? 0;
  const tier = printTicketTierFromStored(t.tier);
  return {
    id: t.id,
    serial,
    serialLabel: formatPrintSerial(serial),
    publicToken: t.publicToken,
    displayCode: formatPrintTicketToken(t.publicToken),
    qrUrl: printTicketQrUrl(baseUrl, t.publicToken),
    tier,
  };
}

export async function issuePrintTickets(input: {
  count: number;
  tier: PrintTicketTier;
  baseUrl?: string;
}): Promise<{ tickets: IssuedPrintTicket[]; fromSerial: number; toSerial: number; tier: PrintTicketTier }> {
  const n = Math.floor(input.count);
  if (!Number.isFinite(n) || n < PRINT_TICKET_ISSUE_MIN || n > PRINT_TICKET_ISSUE_MAX) {
    throw new PrintTicketError(
      "BAD_COUNT",
      `Укажите количество от ${PRINT_TICKET_ISSUE_MIN} до ${PRINT_TICKET_ISSUE_MAX}.`,
    );
  }
  const tier = input.tier;
  const baseUrl = input.baseUrl ?? getPublicAppBaseUrl();

  const tokens = await uniquePrintTokens(n);

  const created = await prisma.$transaction(async (tx) => {
    await tx.printTicketSeq.upsert({
      where: { id: 1 },
      create: { id: 1, next: 1 },
      update: {},
    });
    await tx.$executeRaw(Prisma.sql`SELECT id FROM "PrintTicketSeq" WHERE id = 1 FOR UPDATE`);
    const seq = await tx.printTicketSeq.findUniqueOrThrow({ where: { id: 1 } });
    const start = seq.next;
    await tx.printTicketSeq.update({
      where: { id: 1 },
      data: { next: start + n },
    });

    const rows = tokens.map((publicToken, i) => ({
      publicToken,
      source: "PRINT" as const,
      serial: start + i,
      tier,
      admissionCount: 1,
    }));
    await tx.ticket.createMany({ data: rows });

    return tx.ticket.findMany({
      where: { source: "PRINT", serial: { gte: start, lte: start + n - 1 } },
      orderBy: { serial: "asc" },
      select: { id: true, serial: true, publicToken: true, tier: true },
    });
  });

  const tickets = created.map((t) => toIssuedPrintTicket(t, baseUrl));

  return {
    tickets,
    fromSerial: tickets[0]!.serial,
    toSerial: tickets[tickets.length - 1]!.serial,
    tier,
  };
}

export type PrintTicketAdminRow = {
  id: string;
  serial: number;
  serialLabel: string;
  publicToken: string;
  displayCode: string;
  tier: PrintTicketTier;
  tierLabel: string;
  status: "unregistered" | "registered" | "used" | "cancelled";
  usedAt: string | null;
  createdAt: string;
  customerName: string | null;
  email: string | null;
  phone: string | null;
  slotTitle: string | null;
  slotStartsAt: string | null;
  dateKey: string | null;
  orderId: string | null;
};

export async function listPrintTickets(opts: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ total: number; tickets: PrintTicketAdminRow[] }> {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const q = opts.q?.trim() ?? "";

  const where: Prisma.TicketWhereInput = { source: "PRINT" };

  if (q) {
    const serialNum = Number.parseInt(q.replace(/^0+/, "") || q, 10);
    const tokenCandidates = ticketTokenLookupCandidates(q);
    const or: Prisma.TicketWhereInput[] = [];
    if (Number.isFinite(serialNum) && serialNum > 0) {
      or.push({ serial: serialNum });
    }
    if (tokenCandidates.length > 0) {
      or.push({ publicToken: { in: tokenCandidates } });
    }
    or.push({
      order: {
        customer: {
          email: { contains: q, mode: "insensitive" },
        },
      },
    });
    or.push({
      order: {
        customer: {
          name: { contains: q, mode: "insensitive" },
        },
      },
    });
    where.OR = or;
  }

  const [total, rows] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      orderBy: { serial: "desc" },
      skip: offset,
      take: limit,
      include: { order: { include: { customer: true, slot: true } } },
    }),
  ]);

  const tz = getExhibitionTimezone();
  const tickets: PrintTicketAdminRow[] = rows.map((t) => {
    const order = t.order;
    const registered = printReservationActive(t);
    const cancelled = Boolean(order && (order.status === "CANCELLED" || order.status === "REFUNDED"));
    const showGuest = Boolean(order) && (registered || cancelled || Boolean(t.usedAt));
    const tier = printTicketTierFromStored(t.tier);
    return {
      id: t.id,
      serial: t.serial ?? 0,
      serialLabel: formatPrintSerial(t.serial ?? 0),
      publicToken: t.publicToken,
      displayCode: formatPrintTicketToken(t.publicToken),
      tier,
      tierLabel: printTicketTierLabelRu(tier),
      status: t.usedAt ? "used" : registered ? "registered" : cancelled ? "cancelled" : "unregistered",
      usedAt: t.usedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
      customerName: showGuest ? order!.customer.name : null,
      email: showGuest ? order!.customer.email : null,
      phone: showGuest ? order!.customer.phone : null,
      slotTitle: showGuest ? order!.slot.title : null,
      slotStartsAt: showGuest ? order!.slot.startsAt.toISOString() : null,
      dateKey: showGuest ? dateKeyInTz(order!.slot.startsAt, tz) : null,
      orderId: showGuest ? order!.id : null,
    };
  });

  return { total, tickets };
}

export async function cancelPrintTicketReservation(ticketId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: ticketId },
      include: { order: true },
    });
    if (!ticket || ticket.source !== "PRINT") {
      throw new PrintTicketError("NOT_PRINT", "Это не печатный билет.");
    }
    if (ticket.usedAt) {
      throw new PrintTicketError("ALREADY_USED", "Билет уже использован на входе, бронь снять нельзя.");
    }
    if (!ticket.orderId || !ticket.order) {
      throw new PrintTicketError("NOT_REGISTERED", "Бронь по этому билету ещё не создана.");
    }
    if (ticket.order.status !== "PAID") {
      throw new PrintTicketError("NOT_REGISTERED", "Активной брони нет.");
    }

    await tx.order.update({
      where: { id: ticket.orderId },
      data: { status: "CANCELLED" },
    });
  });
}

export async function loadPrintTicketsForPdf(opts: {
  fromSerial?: number;
  toSerial?: number;
  ids?: string[];
}): Promise<IssuedPrintTicket[]> {
  const baseUrl = getPublicAppBaseUrl();
  const where: Prisma.TicketWhereInput = { source: "PRINT" };
  if (opts.ids && opts.ids.length > 0) {
    where.id = { in: opts.ids };
  } else if (opts.fromSerial != null && opts.toSerial != null) {
    where.serial = { gte: opts.fromSerial, lte: opts.toSerial };
  } else {
    throw new PrintTicketError("BAD_COUNT", "Укажите диапазон номеров или список билетов.");
  }

  const rows = await prisma.ticket.findMany({
    where,
    orderBy: { serial: "asc" },
    select: { id: true, serial: true, publicToken: true, tier: true },
  });
  if (rows.length === 0) {
    throw new PrintTicketError("NOT_FOUND", "Печатные билеты в этом диапазоне не найдены.");
  }
  return rows.map((t) => toIssuedPrintTicket(t, baseUrl));
}
