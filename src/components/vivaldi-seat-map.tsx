"use client";

import { useMemo } from "react";
import type { VivaldiSeat } from "@/lib/vivaldi/seat-map";

type VivaldiSeatMapProps = {
  seats: VivaldiSeat[];
  occupied: Set<string>;
  /** Пригласительные. Покупателю эти места приходят внутри occupied. */
  complimentary?: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  /** buy — покупатель. staff — выдача билета. sale — открыть или закрыть место. */
  mode?: "buy" | "staff" | "sale";
};

type SeatMapMode = "buy" | "staff" | "sale";

type SeatState = "unavailable" | "bought" | "complimentary" | "held" | "selected" | "free";

const EMPTY_COMPLIMENTARY = new Set<string>();
const B_ROWS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const B_SEAT_COUNT = 25;
const AC_SEAT_COUNT = 15;

function seatState(
  seat: VivaldiSeat,
  occupied: Set<string>,
  complimentary: Set<string>,
  selected: Set<string>,
  mode: SeatMapMode,
): SeatState {
  const blocked =
    occupied.has(seat.key) ||
    complimentary.has(seat.key) ||
    seat.availability !== "sale" ||
    !seat.selectable;
  if (mode === "buy") {
    if (blocked) return "unavailable";
    if (selected.has(seat.key)) return "selected";
    return "free";
  }
  if (complimentary.has(seat.key)) return "complimentary";
  if (occupied.has(seat.key)) return "bought";
  if (seat.availability !== "sale" || !seat.selectable) return "held";
  if (selected.has(seat.key)) return "selected";
  return "free";
}

function seatTitle(seat: VivaldiSeat, state: SeatState, mode: SeatMapMode): string {
  if (state === "unavailable") return `${seat.label} — недоступно`;
  if (state === "bought") return `${seat.label} — куплено`;
  if (state === "complimentary") return `${seat.label} — пригласительный`;
  if (state === "held" && mode === "sale") {
    return `${seat.label} — закрыто, нажмите, чтобы открыть продажу`;
  }
  if (state === "held") return `${seat.label} — занято`;
  if (state === "free" && mode === "sale") {
    return `${seat.label} — в продаже, нажмите, чтобы закрыть`;
  }
  if (state === "free" && mode === "staff") {
    return `${seat.label} — свободно, нажмите, чтобы выдать пригласительный`;
  }
  return `${seat.label} — ${seat.priceCents / 100} BYN`;
}

function RowBadge({ n }: { n: number }) {
  return <span className="vv-row-badge">{n}</span>;
}

function SeatButton({
  seat,
  occupied,
  complimentary,
  selected,
  onToggle,
  disabled,
  mode,
}: {
  seat: VivaldiSeat;
  occupied: Set<string>;
  complimentary: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  mode: SeatMapMode;
}) {
  const state = seatState(seat, occupied, complimentary, selected, mode);
  const staffClickable = mode === "sale" ? state === "free" || state === "held" : state === "free";
  const clickDisabled = Boolean(
    disabled ||
      (mode === "buy" ?
        occupied.has(seat.key) || complimentary.has(seat.key) || !seat.selectable
      : !staffClickable),
  );

  return (
    <button
      type="button"
      className={`vv-seat vv-seat--${state}`}
      aria-label={seat.label}
      aria-pressed={state === "selected"}
      disabled={clickDisabled}
      title={seatTitle(seat, state, mode)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onToggle(seat.key)}
    >
      {seat.seat}
    </button>
  );
}

function HorizontalRow({
  byKey,
  occupied,
  complimentary,
  selected,
  onToggle,
  disabled,
  mode,
  sector,
  row,
}: {
  byKey: Map<string, VivaldiSeat>;
  occupied: Set<string>;
  complimentary: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  mode: SeatMapMode;
  sector: "A" | "C";
  row: number;
}) {
  return (
    <div className="vv-h-row">
      <RowBadge n={row} />
      {Array.from({ length: AC_SEAT_COUNT }, (_, i) => i + 1).map((num) => {
        const seat = byKey.get(`${sector}:${row}:${num}`);
        if (!seat) return null;
        return (
          <SeatButton
            key={seat.key}
            seat={seat}
            occupied={occupied}
            complimentary={complimentary}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            mode={mode}
          />
        );
      })}
    </div>
  );
}

export function VivaldiSeatMap({
  seats,
  occupied,
  complimentary = EMPTY_COMPLIMENTARY,
  selected,
  onToggle,
  disabled,
  mode = "buy",
}: VivaldiSeatMapProps) {
  const byKey = useMemo(() => new Map(seats.map((seat) => [seat.key, seat])), [seats]);

  return (
    <div className="vv-map" role="group" aria-label="Схема зала">
      <div className="vv-map__board">
        <div className="vv-scallops vv-scallops--top" aria-hidden />
        <div className="vv-floor">
          <span className="vv-floor__a">Сектор A</span>
          <span className="vv-floor__b">Сектор B</span>
          <span className="vv-floor__c">Сектор C</span>
        </div>
        <div className="vv-stage">
          <div className="vv-stage__body">Сцена</div>
          <div className="vv-stage__ramp" aria-hidden />
        </div>
        <div className="vv-scallops vv-scallops--bottom" aria-hidden />

        <div className="vv-cluster vv-cluster--b">
          {B_ROWS.map((row) => (
            <div key={`B-${row}`} className="vv-b-col">
              <RowBadge n={row} />
              {Array.from({ length: B_SEAT_COUNT }, (_, i) => i + 1).map((num) => {
                const seat = byKey.get(`B:${row}:${num}`);
                if (!seat) return null;
                return (
                  <SeatButton
                    key={seat.key}
                    seat={seat}
                    occupied={occupied}
                    complimentary={complimentary}
                    selected={selected}
                    onToggle={onToggle}
                    disabled={disabled}
                    mode={mode}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="vv-cluster vv-cluster--a">
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            complimentary={complimentary}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            mode={mode}
            sector="A"
            row={2}
          />
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            complimentary={complimentary}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            mode={mode}
            sector="A"
            row={1}
          />
        </div>

        <div className="vv-cluster vv-cluster--c">
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            complimentary={complimentary}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            mode={mode}
            sector="C"
            row={1}
          />
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            complimentary={complimentary}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            mode={mode}
            sector="C"
            row={2}
          />
        </div>
      </div>
    </div>
  );
}
