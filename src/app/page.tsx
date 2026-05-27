import { SiteGateForm } from "@/components/site-gate-form";
import { hasSiteGateAccess } from "@/lib/auth-site-gate";
import { HomeContent } from "./home-content";

export default async function Home() {
  const allowed = await hasSiteGateAccess();
  if (!allowed) return <SiteGateForm />;
  return <HomeContent />;
}
