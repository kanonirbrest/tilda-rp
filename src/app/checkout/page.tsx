import Link from "next/link";
import { redirect } from "next/navigation";
import { messageForResolveFailure } from "@/lib/resolve-checkout-messages";
import { resolveCheckoutSlot } from "@/lib/resolve-checkout-slot";
import { buildLinesFromCounts, unitPriceCents } from "@/lib/slot-pricing";
import {
  hasDateAndTimeInQuery,
  normalizeTicketCounts,
  parseTicketCountParam,
} from "@/lib/ticket-checkout-params";
import { CheckoutForm } from "./ui";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{
    slotId?: string;
    date?: string;
    time?: string;
    adult?: string;
    child?: string;
    concession?: string;
  }>;
}) {
  const sp = await searchParams;
  const adult = parseTicketCountParam(sp.adult);
  const child = parseTicketCountParam(sp.child);
  const concession = parseTicketCountParam(sp.concession);

  const resolved = await resolveCheckoutSlot({
    slotId: sp.slotId,
    date: sp.date,
    time: sp.time,
  });

  if (!resolved.ok) {
    if (resolved.code === "DATE_REQUIRED" || resolved.code === "TIME_REQUIRED") {
      redirect("/tickets");
    }
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
        <p className="text-zinc-600">{messageForResolveFailure(resolved.code, "checkout")}</p>
        <Link href="/tickets" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          К списку билетов
        </Link>
      </div>
    );
  }

  const { slot } = resolved;

  const fromTilda = hasDateAndTimeInQuery(sp.date, sp.time);
  const countsNorm = normalizeTicketCounts(adult, child, concession, {
    requireCountsWhenDateTime: fromTilda,
  });
  if (!countsNorm.ok) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
        <p className="text-zinc-600">Не указано количество билетов (adult / child / concession в ссылке).</p>
        <Link href="/tickets" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          К списку билетов
        </Link>
      </div>
    );
  }
  const { adult: a, child: c, concession: co } = countsNorm.counts;

  const lines = buildLinesFromCounts(slot, { adult: a, child: c, concession: co });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <Link href="/tickets" className="text-sm text-zinc-500 underline">
          ← К слотам
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">Оформление</h1>
        <p className="mt-1 text-sm text-zinc-600">{slot.title}</p>
        <p className="text-sm text-zinc-600">
          {slot.startsAt.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })}
        </p>
        <ul className="mt-3 space-y-1 text-sm text-zinc-800">
          {lines.map((l) => (
            <li key={l.tier}>
              {l.tier === "ADULT" ? "Взрослый" : l.tier === "CHILD" ? "Детский" : "Льготный"} × {l.quantity} —{" "}
              {(unitPriceCents(slot, l.tier) / 100).toFixed(2)} {slot.currency} / шт.
            </li>
          ))}
        </ul>
      </div>
      <CheckoutForm slotId={slot.id} lines={lines} />
    </div>
  );
}
