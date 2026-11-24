import { Suspense } from "react";
import { DomRozhdestvaRegister } from "@/components/dom-rozhdestva-register";

export default async function PrintRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  return (
    <Suspense fallback={<p className="nom-plain-msg nom-plain-msg--muted">Загрузка…</p>}>
      <DomRozhdestvaRegister initialToken={t ?? ""} />
    </Suspense>
  );
}
