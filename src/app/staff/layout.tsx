import type { Metadata } from "next";
import { StaffPwaRegister } from "./pwa-register";

/** Та же иконка, что в `icon.svg` и в `manifest.ts` — вкладка и PWA. */
export const metadata: Metadata = {
  icons: {
    icon: [{ url: "/staff/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/staff/icon.svg", type: "image/svg+xml" }],
  },
};

export default function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <StaffPwaRegister />
      {children}
    </>
  );
}
