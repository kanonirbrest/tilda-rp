"use client";

import type { CSSProperties } from "react";
import { VIVALDI_HALL_SIZE } from "@/lib/vivaldi/seat-hitboxes";
import type { VivaldiSeat } from "@/lib/vivaldi/seat-map";

type VivaldiSeatMapProps = {
  seats: VivaldiSeat[];
  occupied: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
};

function boxStyle(seat: VivaldiSeat): CSSProperties {
  return {
    left: `${(seat.x / VIVALDI_HALL_SIZE.width) * 100}%`,
    top: `${(seat.y / VIVALDI_HALL_SIZE.height) * 100}%`,
    width: `${(seat.w / VIVALDI_HALL_SIZE.width) * 100}%`,
    height: `${(seat.h / VIVALDI_HALL_SIZE.height) * 100}%`,
  };
}

function seatTitle(seat: VivaldiSeat, occupied: boolean, blocked: boolean): string {
  if (occupied) return `${seat.label} — занято`;
  if (seat.availability === "ticketpro") return `${seat.label} — недоступно`;
  if (seat.availability === "reserved" || blocked) return `${seat.label} — не в продаже`;
  return `${seat.label} — ${seat.priceCents / 100} BYN`;
}

export function VivaldiSeatMap({
  seats,
  occupied,
  selected,
  onToggle,
  disabled,
}: VivaldiSeatMapProps) {
  return (
    <div className="vv-hall" role="group" aria-label="Схема зала">
      <div className="vv-stage" aria-hidden>
        Сцена
      </div>
      {seats.map((seat) => {
        const isOccupied = occupied.has(seat.key);
        const blocked = !seat.selectable && !isOccupied;
        const isSelected = selected.has(seat.key);
        const state = isOccupied
          ? "sold"
          : seat.availability === "ticketpro"
            ? "ticketpro"
            : seat.availability === "reserved" || blocked
              ? "reserved"
              : isSelected
                ? "selected"
                : "free";
        const clickDisabled = Boolean(disabled || isOccupied || !seat.selectable);
        return (
          <button
            key={seat.key}
            type="button"
            className={`vv-hot vv-hot--${state}`}
            style={boxStyle(seat)}
            aria-label={seat.label}
            aria-pressed={isSelected}
            disabled={clickDisabled}
            title={seatTitle(seat, isOccupied, blocked)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onToggle(seat.key)}
          />
        );
      })}
    </div>
  );
}
