import { StaffLogoutButton } from "../../logout-button";
import { TerminalScanClient } from "./terminal-scan-client";

export default function StaffTerminalScanPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-zinc-900">Сканер терминала</h1>
        <StaffLogoutButton />
      </div>
      <TerminalScanClient />
      <p className="text-center text-xs text-zinc-500">
        ТСД (Keyboard Wedge + Enter). Камера:{" "}
        <a className="underline" href="/staff/scan">
          сканер телефона
        </a>
      </p>
    </div>
  );
}
