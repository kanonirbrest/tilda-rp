import Link from "next/link";
import { Suspense } from "react";
import { QuickClient } from "./quick-client";

export default async function StaffQuickPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  if (!t) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 text-center text-sm text-zinc-600 sm:px-6">
        Не передан параметр <code className="font-mono">t</code> (токен билета).
        <div className="mt-4 flex flex-wrap justify-center gap-4">
          <Link href="/staff/scan" className="font-medium text-zinc-900 underline">
            Сканер телефона
          </Link>
          <Link href="/staff/scan/terminal" className="font-medium text-zinc-900 underline">
            Сканер терминала
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-zinc-600">Загрузка…</p>}>
      <QuickClient token={t} />
    </Suspense>
  );
}
