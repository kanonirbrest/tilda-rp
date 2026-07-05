import Link from "next/link";

export function HomeContent() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center gap-8 px-4 py-20 text-center sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">DEI Tickets</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-600">
          Бэкенд оплаты и билетов: API для сайта, bePaid, админка сеансов, вход персонала и сканер QR.
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <Link
          href="/buy-tickets"
          className="rounded-xl bg-emerald-800 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-900"
        >
          Купить билет
        </Link>
        <Link
          href="/buy-tickets-summer"
          className="rounded-xl border border-emerald-700/40 bg-white px-6 py-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
        >
          Купить билет - лето
        </Link>
        <Link
          href="/buy-tickets-smr"
          className="rounded-xl border border-emerald-700/40 bg-white px-6 py-3 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
        >
          Купить билет лето v2
        </Link>
        <Link
          href="/nightofmuseums"
          className="rounded-xl border border-emerald-700/40 bg-emerald-50 px-6 py-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
        >
          Ночь музеев
        </Link>
        <Link
          href="/belye-nochi-18"
          className="rounded-xl border border-emerald-700/40 bg-emerald-50 px-6 py-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
        >
          Белые ночи 18+
        </Link>
        <Link
          href="/sady-snovideniy"
          className="rounded-xl border border-violet-700/40 bg-violet-50 px-6 py-3 text-sm font-medium text-violet-900 hover:bg-violet-100"
        >
          Сады сновидений (6 июл)
        </Link>
        <Link
          href="/sady-snovideniy-20-07"
          className="rounded-xl border border-violet-700/40 bg-violet-50 px-6 py-3 text-sm font-medium text-violet-900 hover:bg-violet-100"
        >
          Сады сновидений (20 июл)
        </Link>
        <Link
          href="/staff/login"
          className="rounded-xl border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-800"
        >
          Персонал
        </Link>
        <Link
          href="/admin"
          className="rounded-xl border border-zinc-200 px-6 py-3 text-sm font-medium text-zinc-600"
        >
          Админка
        </Link>
      </div>
    </div>
  );
}
