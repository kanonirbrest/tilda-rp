import Link from "next/link";
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
        <div className="mt-4">
          <Link href="/staff/scan" className="font-medium text-zinc-900 underline">
            К сканеру
          </Link>
        </div>
      </div>
    );
  }

  return <QuickClient token={t} />;
}
