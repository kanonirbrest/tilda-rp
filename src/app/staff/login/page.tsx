import { StaffLoginForm } from "./ui";

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/staff/scan";

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Персонал</h1>
        <p className="mt-1 text-sm text-zinc-600">Вход по логину и паролю</p>
      </div>
      <StaffLoginForm nextPath={safeNext} />
      <p className="text-sm text-zinc-600">
        После входа:{" "}
        <a className="font-medium text-zinc-900 underline" href="/staff/scan">
          сканер телефона
        </a>
        {" · "}
        <a className="font-medium text-zinc-900 underline" href="/staff/scan/terminal">
          сканер терминала
        </a>
      </p>
    </div>
  );
}
