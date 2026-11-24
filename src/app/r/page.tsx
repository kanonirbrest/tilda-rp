import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DomRozhdestvaRegister } from "@/components/dom-rozhdestva-register";
import { getStaffFromCookies } from "@/lib/auth-staff";

export default async function PrintRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const token = t?.trim() ?? "";
  if (token) {
    const staff = await getStaffFromCookies();
    if (staff) {
      redirect(`/staff/quick?t=${encodeURIComponent(token)}`);
    }
  }

  return (
    <Suspense fallback={<p className="nom-plain-msg nom-plain-msg--muted">Загрузка…</p>}>
      <DomRozhdestvaRegister initialToken={token} />
    </Suspense>
  );
}
