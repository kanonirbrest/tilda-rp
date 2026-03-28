import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  const slots = await prisma.slot.findMany({
    where: { active: true },
    orderBy: { startsAt: "asc" },
  });

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Выберите билет</h1>
        <p className="mt-1 text-sm text-zinc-600">
          После выбора укажите контакты и оплату.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {slots.length === 0 ? (
          <li className="rounded-xl border border-zinc-200 bg-white p-4 text-zinc-600">
            Нет доступных слотов. Добавьте слоты в БД или выполните{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs">npm run db:seed</code>.
          </li>
        ) : (
          slots.map((s) => (
            <li key={s.id}>
              <Link
                href={`/checkout?slotId=${encodeURIComponent(s.id)}`}
                className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
              >
                <div className="font-medium text-zinc-900">{s.title}</div>
                <div className="mt-1 text-sm text-zinc-600">
                  {s.startsAt.toLocaleString("ru-RU", {
                    dateStyle: "long",
                    timeStyle: "short",
                  })}
                </div>
                <div className="mt-2 text-sm font-semibold text-zinc-800">
                  {(s.priceCents / 100).toFixed(2)} {s.currency}
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>
      <p className="text-center text-xs text-zinc-500">
        <Link href="/staff/login" className="underline">
          Вход для персонала
        </Link>
      </p>
    </div>
  );
}
