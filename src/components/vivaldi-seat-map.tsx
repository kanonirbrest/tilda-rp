"use client";

import { useMemo } from "react";
import type { VivaldiSeat } from "@/lib/vivaldi/seat-map";

type VivaldiSeatMapProps = {
  seats: VivaldiSeat[];
  occupied: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
};

type SeatState = "sold" | "ticketpro" | "reserved" | "selected" | "free";

const B_ROWS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const B_SEAT_COUNT = 25;
const AC_SEAT_COUNT = 15;

function seatState(
  seat: VivaldiSeat,
  occupied: Set<string>,
  selected: Set<string>,
): SeatState {
  if (occupied.has(seat.key)) return "sold";
  if (seat.availability === "ticketpro") return "ticketpro";
  if (seat.availability === "reserved" || !seat.selectable) return "reserved";
  if (selected.has(seat.key)) return "selected";
  return "free";
}

function seatTitle(seat: VivaldiSeat, state: SeatState): string {
  if (state === "sold") return `${seat.label} — занято`;
  if (state === "ticketpro") return `${seat.label} — недоступно`;
  if (state === "reserved") return `${seat.label} — не в продаже`;
  return `${seat.label} — ${seat.priceCents / 100} BYN`;
}

function RowBadge({ n }: { n: number }) {
  return <span className="vv-row-badge">{n}</span>;
}

function SeatButton({
  seat,
  occupied,
  selected,
  onToggle,
  disabled,
}: {
  seat: VivaldiSeat;
  occupied: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  const state = seatState(seat, occupied, selected);
  const clickDisabled = Boolean(disabled || occupied.has(seat.key) || !seat.selectable);

  return (
    <button
      type="button"
      className={`vv-seat vv-seat--${state}`}
      aria-label={seat.label}
      aria-pressed={state === "selected"}
      disabled={clickDisabled}
      title={seatTitle(seat, state)}
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
  selected,
  onToggle,
  disabled,
  sector,
  row,
}: {
  byKey: Map<string, VivaldiSeat>;
  occupied: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
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
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}

export function VivaldiSeatMap({
  seats,
  occupied,
  selected,
  onToggle,
  disabled,
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
                    selected={selected}
                    onToggle={onToggle}
                    disabled={disabled}
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
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            sector="A"
            row={2}
          />
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            sector="A"
            row={1}
          />
        </div>

        <div className="vv-cluster vv-cluster--c">
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            sector="C"
            row={1}
          />
          <HorizontalRow
            byKey={byKey}
            occupied={occupied}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            sector="C"
            row={2}
          />
        </div>
      </div>
    </div>
  );
}
