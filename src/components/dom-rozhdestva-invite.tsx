"use client";

import { useState } from "react";

type InviteResponse = {
  slotId: string;
  title: string;
  issued: { orderId: string; publicToken: string };
};

type Props = {
  slotId: string;
  slotTitle: string;
  onClose: () => void;
};

async function adminJson<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const text = await r.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* ignore */
  }
  if (!r.ok) {
    const msg =
      json && typeof json === "object" && json !== null && "message" in json ?
        String((json as { message?: string }).message)
      : `Ошибка ${r.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export function DomRozhdestvaInvite({ slotId, slotTitle, onClose }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState<"email" | "download" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function savePdf(token: string) {
    const r = await fetch(`/api/tickets/${encodeURIComponent(token)}/pdf`);
    if (!r.ok) throw new Error("Билет выдан, но файл не скачался. Его можно сохранить из заказа.");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "priglasitelny-dom-rozhdestva.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function issue(deliver: "email" | "download") {
    if (busy) return;
    if (name.trim().length < 2) {
      setError("Укажите имя");
      return;
    }
    if (deliver === "email" && (!email.trim() || phone.trim().length < 5)) {
      setError("Для письма укажите почту и телефон");
      return;
    }
    setBusy(deliver);
    setError("");
    setInfo("");
    try {
      const body = await adminJson<InviteResponse>(
        `/api/admin/slots/${encodeURIComponent(slotId)}/invite`,
        {
          method: "POST",
          body: JSON.stringify({ name, email, phone, deliver }),
        },
      );
      setName("");
      setEmail("");
      setPhone("");
      if (deliver === "download") {
        const token = body.issued?.publicToken;
        if (!token) throw new Error("Билет выдан, но файл не скачался. Его можно сохранить из заказа.");
        await savePdf(token);
        setInfo("Билет сохранён на компьютер");
      } else {
        setInfo("Пригласительный отправлен на почту");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выдать билет");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="god-root">
      <p className="admin-hint admin-hint--tight">{slotTitle}. Билет без оплаты, занимает одно место из лимита сеанса.</p>
      <div className="admin-row admin-row--modal">
        <div className="admin-field">
          <label htmlFor="invite-name">Имя</label>
          <input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
      </div>
      <div className="admin-row admin-row--modal">
        <div className="admin-field">
          <label htmlFor="invite-email">Почта (для письма)</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="admin-field">
          <label htmlFor="invite-phone">Телефон (для письма)</label>
          <input
            id="invite-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      {error ? <div className="admin-alert admin-alert--err">{error}</div> : null}
      {info ? <p className="admin-hint admin-hint--tight">{info}</p> : null}
      <div className="admin-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy !== null}
          onClick={() => void issue("email")}
        >
          {busy === "email" ? "Отправка…" : "Отправить на почту"}
        </button>
        <button type="button" className="btn" disabled={busy !== null} onClick={() => void issue("download")}>
          {busy === "download" ? "Сохранение…" : "Сохранить на компьютер"}
        </button>
      </div>
    </div>
  );
}
