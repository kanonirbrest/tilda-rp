"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GardensSchemePanzoom } from "@/components/gardens-scheme-panzoom";
import { GardensSeatMap } from "@/components/gardens-seat-map";
import type { GardensSeat } from "@/lib/gardens-of-dreams/seat-map";
import "../app/sady-snovideniy/sady-snovideniy.css";

type SeatSalesResponse = {
  slotId: string;
  title: string;
  variant: string;
  overrides: Record<string, boolean>;
  seats: GardensSeat[];
  occupied: string[];
  onSaleCount: number;
  error?: string;
  message?: string;
};

async function adminJsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
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

type GardensSeatSalesEditorProps = {
  slotId: string;
  slotTitle: string;
  onClose: () => void;
  onSaved?: () => void;
};

export function GardensSeatSalesEditor({
  slotId,
  slotTitle,
  onClose,
  onSaved,
}: GardensSeatSalesEditorProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [seats, setSeats] = useState<GardensSeat[]>([]);
  const [occupiedKeys, setOccupiedKeys] = useState<string[]>([]);
  const [onSaleCount, setOnSaleCount] = useState(0);
  const [overrideCount, setOverrideCount] = useState(0);

  const occupied = useMemo(() => new Set(occupiedKeys), [occupiedKeys]);

  const applyPayload = useCallback((data: SeatSalesResponse) => {
    setSeats(data.seats);
    setOccupiedKeys(data.occupied);
    setOnSaleCount(data.onSaleCount);
    setOverrideCount(Object.keys(data.overrides ?? {}).length);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await adminJsonFetch<SeatSalesResponse>(
        `/api/admin/slots/${encodeURIComponent(slotId)}/seat-sales`,
      );
      applyPayload(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [applyPayload, slotId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleSeat(key: string) {
    const seat = seats.find((s) => s.key === key);
    if (!seat || occupied.has(key) || busy) return;
    const onSale = !seat.selectable;
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const data = await adminJsonFetch<SeatSalesResponse>(
        `/api/admin/slots/${encodeURIComponent(slotId)}/seat-sales`,
        {
          method: "PATCH",
          body: JSON.stringify({ toggles: [{ seatKey: key, onSale }] }),
        },
      );
      applyPayload(data);
      setInfo(onSale ? `Выставлено: ${seat.label}` : `Снято с продажи: ${seat.label}`);
      onSaved?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetOverrides() {
    if (
      !window.confirm(
        "Сбросить все ручные изменения мест для этого сеанса? Останется только схема из кода.",
      )
    ) {
      return;
    }
    setBusy(true);
    setErr("");
    setInfo("");
    try {
      const data = await adminJsonFetch<SeatSalesResponse>(
        `/api/admin/slots/${encodeURIComponent(slotId)}/seat-sales`,
        { method: "DELETE" },
      );
      applyPayload(data);
      setInfo("Ручные изменения сброшены.");
      onSaved?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="god-root admin-gardens-seat-sales">
      <p className="admin-hint admin-hint--tight">{slotTitle}</p>
      <p className="admin-hint">
        Клик по серому месту — выставить в продажу. Клик по цветному свободному — снять с продажи.
        Занятые места не трогаем.
      </p>
      <div className="admin-toolbar-row">
        <button
          type="button"
          className={`btn btn-secondary ${loading || busy ? "is-loading" : ""}`}
          onClick={() => void load()}
          disabled={loading || busy}
        >
          Обновить
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void resetOverrides()}
          disabled={loading || busy || overrideCount === 0}
        >
          Сбросить ручные
        </button>
        <span className="admin-hint">
          В продаже: {onSaleCount}
          {overrideCount > 0 ? ` · ручных правок: ${overrideCount}` : ""}
        </span>
      </div>
      {err ? <p className="admin-hint" style={{ color: "#f87171" }}>{err}</p> : null}
      {info ? <p className="admin-hint">{info}</p> : null}
      {loading ? (
        <div className="admin-empty admin-empty--compact">Загрузка схемы…</div>
      ) : (
        <div className="admin-gardens-seat-sales__map god-map-scroll">
          <GardensSchemePanzoom>
            <GardensSeatMap
              seats={seats}
              occupied={occupied}
              selected={new Set()}
              onToggle={(key) => void toggleSeat(key)}
              disabled={busy}
              mode="admin-sale"
            />
          </GardensSchemePanzoom>
        </div>
      )}
      <div className="admin-modal-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
