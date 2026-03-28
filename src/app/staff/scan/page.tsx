import { StaffLogoutButton } from "../logout-button";
import { ScanClient } from "./scan-client";

export default function StaffScanPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-zinc-900">Сканер билетов</h1>
        <StaffLogoutButton />
      </div>
      <ScanClient />
      <p className="text-center text-xs text-zinc-500">
        После сканирования откроется страница проверки. Ссылку из QR можно открыть вручную после входа.
      </p>
    </div>
  );
}
