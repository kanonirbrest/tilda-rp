"use client";

export function StaffLogoutButton() {
  return (
    <button
      type="button"
      className="text-sm text-zinc-500 underline"
      onClick={async () => {
        await fetch("/api/staff/logout", { method: "POST" });
        window.location.href = "/staff/login";
      }}
    >
      Выйти
    </button>
  );
}
