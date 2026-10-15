"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GardensSchemePanzoom } from "@/components/gardens-scheme-panzoom";
import { VivaldiSeatMap } from "@/components/vivaldi-seat-map";
import type { VivaldiSeat } from "@/lib/vivaldi/seat-map";
import "../app/sady-snovideniy/sady-snovideniy.css";
import "../app/koncert-vivaldi/vivaldi.css";

type SeatStaffResponse = {
  title?: string;
  seats: VivaldiSeat[];
  occupied: string[];
  complimentary: string[];
  message?: string;
  error?: string;
  issued?: { orderId: string; seatLabel: string; publicToken: string };
};

type VivaldiSeatStaffProps = {
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
      : text || r.statusText;
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return json as T;
}

export function VivaldiSeatStaff({ slotId, slotTitle, onClose }: VivaldiSeatStaffProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"email" | "download" | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [title, setTitle] = useState(slotTitle);
  const [seats, setSeats] = useState<VivaldiSeat[]>([]);
  const [occupiedKeys, setOccupiedKeys] = useState<string[]>([]);
  const [complimentaryKeys, setComplimentaryKeys] = useState<string[]>([]);
  const [picked, setPicked] = useState<VivaldiSeat | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const apply = useCallback((body: SeatStaffResponse) => {
    setTitle(body.title || slotTitle);
    setSeats(body.seats);
    setOccupiedKeys(body.occupied);
    setComplimentaryKeys(body.complimentary);
  }, [slotTitle]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const body = await adminJson<SeatStaffResponse>(
        `/api/admin/slots/${encodeURIComponent(slotId)}/complimentary`,
      );
      apply(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить схему");
    } finally {
      setLoading(false);
    }
  }, [apply, slotId]);

  useEffect(() => {
    void load();
  }, [load]);

  const occupied = useMemo(() => new Set(occupiedKeys), [occupiedKeys]);
  const complimentary = useMemo(() => new Set(complimentaryKeys), [complimentaryKeys]);
  const counts = useMemo(() => {
    let bought = 0;
    let invited = 0;
    let held = 0;
    let free = 0;
    for (const seat of seats) {
      if (complimentary.has(seat.key)) invited += 1;
      else if (occupied.has(seat.key)) bought += 1;
      else if (seat.availability !== "sale" || !seat.selectable) held += 1;
      else free += 1;
    }
    return { bought, invited, held, free };
  }, [complimentary, occupied, seats]);

  function pickSeat(key: string) {
    if (busy || occupied.has(key) || complimentary.has(key)) return;
    const seat = seats.find((item) => item.key === key);
    if (!seat?.selectable) return;
    setPicked(seat);
    setError("");
    setInfo("");
  }

  async function savePdf(token: string, seatLabel: string) {
    const r = await fetch(`/api/tickets/${encodeURIComponent(token)}/pdf`);
    if (!r.ok) throw new Error("Билет выдан, но файл не скачался. Его можно сохранить из заказа.");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safe = seatLabel.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    link.download = `priglasitelny-${safe || "bilet"}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function issue(deliver: "email" | "download") {
    if (!picked || busy) return;
    if (name.trim().length < 2) {
      setError("Укажите имя");
      return;
    }
    if (deliver === "email" && (!email.trim() || phone.trim().length < 5)) {
      setError("Для письма укажите почту и телефон");
      return;
    }
    const seat = picked;
    setBusy(deliver);
    setError("");
    setInfo("");
    try {
      const body = await adminJson<SeatStaffResponse>(
        `/api/admin/slots/${encodeURIComponent(slotId)}/complimentary`,
        {
          method: "POST",
          body: JSON.stringify({
            seatKey: seat.key,
            name,
            email,
            phone,
            deliver,
          }),
        },
      );
      apply(body);
      setPicked(null);
      setName("");
      setEmail("");
      setPhone("");
      if (deliver === "download") {
        const token = body.issued?.publicToken;
        if (!token) throw new Error("Билет выдан, но файл не скачался. Его можно сохранить из заказа.");
        await savePdf(token, seat.label);
        setInfo(`Билет сохранён: ${seat.label}`);
      } else {
        setInfo(`Пригласительный отправлен: ${seat.label}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выдать билет");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="god-root admin-gardens-seat-sales">
      <p className="admin-hint admin-hint--tight">{title}</p>
      <p className="admin-hint">
        Клик по свободному месту выдаёт пригласительный без оплаты, место снимается с продажи.
        «Сохранить на компьютер» скачивает PDF, письмо не отправляется. Синие места уже выданы.
      </p>
      {loading ? <p className="admin-hint">Загрузка схемы…</p> : null}
      {error ? <p className="admin-hint" style={{ color: "#f87171" }}>{error}</p> : null}
      {!error && info ? <p className="admin-hint">{info}</p> : null}
      {picked ? (
        <form className="admin-field admin-field--full" onSubmit={(e) => e.preventDefault()}>
          <p className="admin-hint admin-hint--tight">Пригласительный: {picked.label}</p>
          <label className="admin-field">
            Имя
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          </label>
          <label className="admin-field">
            Почта
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="только если отправлять письмом"
            />
          </label>
          <label className="admin-field">
            Телефон
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              placeholder="только если отправлять письмом"
            />
          </label>
          <div className="admin-modal-actions">
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => setPicked(null)}>
              Отмена
            </button>
            <button type="button" className="btn btn-secondary" disabled={busy !== null} onClick={() => void issue("email")}>
              {busy === "email" ? "Отправка…" : "Отправить на почту"}
            </button>
            <button type="button" className="btn" disabled={busy !== null} onClick={() => void issue("download")}>
              {busy === "download" ? "Сохранение…" : "Сохранить на компьютер"}
            </button>
          </div>
        </form>
      ) : null}
      {!loading && seats.length > 0 ? (
        <>
          <p className="vv-legend" aria-label="Состояние мест">
            <span><i className="vv-swatch-sold" /> Куплено · {counts.bought}</span>
            <span><i className="vv-swatch-complimentary" /> Пригласительный · {counts.invited}</span>
            <span><i className="vv-swatch-off" /> Занято · {counts.held}</span>
            <span><i className="vv-swatch-free" /> Свободно · {counts.free}</span>
          </p>
          <div className="admin-gardens-seat-sales__map god-map-scroll">
            <GardensSchemePanzoom>
              <VivaldiSeatMap
                seats={seats}
                occupied={occupied}
                complimentary={complimentary}
                selected={picked ? new Set([picked.key]) : new Set()}
                onToggle={pickSeat}
                disabled={busy !== null}
                mode="staff"
              />
            </GardensSchemePanzoom>
          </div>
        </>
      ) : null}
      <div className="admin-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
