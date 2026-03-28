import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col items-center justify-center gap-8 px-4 py-20 text-center sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Билеты DEI</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Покупка билетов и проверка на входе (демо-скелет под bePaid и Tilda CRM).
        </p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/tickets"
          className="rounded-xl bg-zinc-900 px-6 py-3 text-sm font-medium text-white"
        >
          Купить билет
        </Link>
        <Link
          href="/staff/login"
          className="rounded-xl border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-800"
        >
          Персонал
        </Link>
      </div>
    </div>
  );
}
