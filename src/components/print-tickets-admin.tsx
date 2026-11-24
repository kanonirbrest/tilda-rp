"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PRINT_TICKET_ISSUE_MAX } from "@/lib/print-ticket-token";
type PrintTicketTier = "ADULT" | "CHILD";

type PrintRow = {
  id: string;
  serial: number;
  serialLabel: string;
  displayCode: string;
  tier: PrintTicketTier;
  tierLabel: string;
  status: "unregistered" | "registered" | "used" | "cancelled";
  customerName: string | null;
  email: string | null;
  phone: string | null;
  slotTitle: string | null;
  dateKey: string | null;
};

function statusLabel(s: PrintRow["status"]): string {
  if (s === "registered") return "зарегистрирован";
  if (s === "used") return "прошёл";
  if (s === "cancelled") return "бронь снята";
  return "не зарегистрирован";
}

export function PrintTicketsAdmin() {
  const [q, setQ] = useState("");
  const [count, setCount] = useState(50);
  const [tier, setTier] = useState<PrintTicketTier>("ADULT");
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [lastRange, setLastRange] = useState<{ from: number; to: number } | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(
        `/api/admin/print-tickets?q=${encodeURIComponent(query)}&limit=80`,
        { credentials: "include" },
      );
      const j = (await r.json()) as { tickets?: PrintRow[]; total?: number; message?: string };
      if (!r.ok) throw new Error(j.message || "Не удалось загрузить билеты");
      setRows(j.tickets ?? []);
      setTotal(j.total ?? 0);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load("");
  }, [load]);

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setErr("");
    setInfo("");
    setLoading(true);
    try {
      const r = await fetch("/api/admin/print-tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, tier }),
      });
      const j = (await r.json()) as {
        fromSerial?: number;
        toSerial?: number;
        tickets?: unknown[];
        tier?: PrintTicketTier;
        message?: string;
      };
      if (!r.ok) throw new Error(j.message || "Не удалось создать билеты");
      const from = j.fromSerial ?? 0;
      const to = j.toSerial ?? 0;
      const typeLabel = j.tier === "CHILD" ? "детских" : "взрослых";
      setLastRange({ from, to });
      setInfo(
        `Создано ${j.tickets?.length ?? count} ${typeLabel}. Номера ${String(from).padStart(4, "0")}–${String(to).padStart(4, "0")}.`,
      );
      await load(q);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function downloadPdf(from: number, to: number) {
    window.open(`/api/admin/print-tickets/pdf?from=${from}&to=${to}`, "_blank", "noopener");
  }

  async function cancelReservation(id: string) {
    if (!confirm("Снять бронь? Гость сможет выбрать дату заново, QR не меняется.")) return;
    setErr("");
    setInfo("");
    try {
      const r = await fetch(`/api/admin/print-tickets/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await r.json()) as { message?: string };
      if (!r.ok) throw new Error(j.message || "Не удалось снять бронь");
      setInfo("Бронь снята.");
      await load(q);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="admin-panel admin-panel--tight" aria-label="Печатные билеты">
      <div className="admin-panel-head admin-panel-head--tight">
        <form className="admin-toolbar-row" onSubmit={(e) => void onIssue(e)}>
          <label className="admin-field admin-field-narrow">
            Количество
            <input
              type="number"
              min={1}
              max={PRINT_TICKET_ISSUE_MAX}
              value={count}
              onChange={(e) => setCount(Number.parseInt(e.target.value, 10) || 1)}
            />
          </label>
          <label className="admin-field">
            Тип
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value === "CHILD" ? "CHILD" : "ADULT")}
            >
              <option value="ADULT">Взрослый</option>
              <option value="CHILD">Детский</option>
            </select>
          </label>
          <button type="submit" className="btn" disabled={loading}>
            Сгенерировать
          </button>
          {lastRange ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => downloadPdf(lastRange.from, lastRange.to)}
            >
              Скачать PDF {String(lastRange.from).padStart(4, "0")}–{String(lastRange.to).padStart(4, "0")}
            </button>
          ) : null}
        </form>
        <p className="admin-hint admin-hint--inline">
          Пачка в одном PDF. Тип — взрослый или детский — печатается на бланке. QR ведёт на регистрацию, этот же код — на входе.
        </p>
      </div>

      {err ? <div className="admin-alert admin-alert--err">{err}</div> : null}
      {info ? <div className="admin-alert admin-alert--ok">{info}</div> : null}

      <form
        className="admin-toolbar-row"
        onSubmit={(e) => {
          e.preventDefault();
          void load(q);
        }}
      >
        <input
          type="search"
          placeholder="Код, номер или почта"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn-secondary" disabled={loading}>
          Найти
        </button>
        <span className="admin-muted-text">Всего: {total}</span>
      </form>

      {rows.length === 0 ? (
        <div className="admin-empty admin-empty--compact">{loading ? "Загрузка…" : "Печатных билетов нет"}</div>
      ) : (
        <div className="admin-slot-list" role="list">
          {rows.map((row) => (
            <div key={row.id} className="admin-slot-row" role="listitem">
              <div className="admin-slot-row__time mono">{row.serialLabel}</div>
              <div className="admin-slot-row__main">
                <span className="admin-slot-row__title mono">{row.displayCode}</span>
                <span className="admin-slot-row__meta">
                  {row.tierLabel.toLowerCase()}
                  {` · ${statusLabel(row.status)}`}
                  {row.email ? ` · ${row.email}` : ""}
                  {row.phone ? ` · ${row.phone}` : ""}
                  {row.dateKey ? ` · ${row.dateKey}` : ""}
                  {row.slotTitle ? ` · ${row.slotTitle}` : ""}
                </span>
              </div>
              {row.status === "registered" ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void cancelReservation(row.id)}
                >
                  Снять бронь
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
