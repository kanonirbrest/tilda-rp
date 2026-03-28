import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CheckoutForm } from "./ui";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ slotId?: string }>;
}) {
  const { slotId } = await searchParams;
  /* /checkout без ?slotId= — сразу к выбору слота (часто с телефона: закладка или ручной ввод URL) */
  if (!slotId?.trim()) {
    redirect("/tickets");
  }

  const slot = await prisma.slot.findFirst({
    where: { id: slotId, active: true },
  });
  if (!slot) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6">
        <p className="text-zinc-600">Слот не найден.</p>
        <Link href="/tickets" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          Назад
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div>
        <Link href="/tickets" className="text-sm text-zinc-500 underline">
          ← К слотам
        </Link>
        <h1 className="mt-4 text-xl font-semibold text-zinc-900">Оформление</h1>
        <p className="mt-1 text-sm text-zinc-600">{slot.title}</p>
        <p className="text-sm text-zinc-600">
          {slot.startsAt.toLocaleString("ru-RU", { dateStyle: "long", timeStyle: "short" })} ·{" "}
          <span className="font-medium text-zinc-800">
            {(slot.priceCents / 100).toFixed(2)} {slot.currency}
          </span>
        </p>
      </div>
      <CheckoutForm slotId={slot.id} />
    </div>
  );
}
