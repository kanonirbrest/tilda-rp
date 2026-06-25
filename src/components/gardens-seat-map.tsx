"use client";

import type { CSSProperties } from "react";
import type { GardensSeat, GardensSeatTier } from "@/lib/gardens-of-dreams/seat-map";
import {
  B_ROW1_GROUPS,
  C_ROW1_GROUPS,
  row1StageLayoutFractions,
} from "@/lib/gardens-of-dreams/seat-map";

type GardensSeatMapProps = {
  seats: GardensSeat[];
  occupied: Set<string>;
  selected: Set<string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
};

function seatByKey(seats: GardensSeat[], key: string): GardensSeat | undefined {
  return seats.find((s) => s.key === key);
}

function seatState(
  seat: GardensSeat,
  occupied: Set<string>,
  selected: Set<string>,
): "sold" | "selected" | GardensSeatTier {
  if (!seat.selectable || occupied.has(seat.key)) return "sold";
  if (selected.has(seat.key)) return "selected";
  return seat.tier;
}

function SeatButton({
  seat,
  state,
  onToggle,
  disabled,
}: {
  seat: GardensSeat;
  state: ReturnType<typeof seatState>;
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  const isSold = state === "sold";
  const soldLabel = seat.selectable ? "занято" : "продано";
  return (
    <button
      type="button"
      className={`god-seat god-seat--${state}`}
      aria-label={seat.label}
      aria-pressed={state === "selected"}
      disabled={disabled || isSold}
      title={isSold ? `${seat.label} — ${soldLabel}` : `${seat.label} — ${seat.priceCents / 100} BYN`}
      onClick={() => onToggle(seat.key)}
    >
      {seat.seat}
    </button>
  );
}

function RowLabel({ n }: { n: number }) {
  return <span className="god-row-label">{n}</span>;
}

function renderGroupedRow(
  seats: GardensSeat[],
  occupied: Set<string>,
  selected: Set<string>,
  onToggle: (key: string) => void,
  groups: number[][],
  sector: GardensSeat["sector"],
  row: number,
  disabled?: boolean,
) {
  return (
    <div className="god-seat-row">
      <RowLabel n={row} />
      <div className="god-seat-groups">
        {groups.map((group, gi) => (
          <div key={`${sector}-${row}-g${gi}`} className="god-seat-group">
            {group.map((num) => {
              const seat = seatByKey(seats, `${sector}:${row}:${num}`);
              if (!seat) return null;
              return (
                <SeatButton
                  key={seat.key}
                  seat={seat}
                  state={seatState(seat, occupied, selected)}
                  onToggle={onToggle}
                  disabled={disabled}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderFlatRow(
  seats: GardensSeat[],
  occupied: Set<string>,
  selected: Set<string>,
  onToggle: (key: string) => void,
  sector: GardensSeat["sector"],
  row: number,
  count: number,
  disabled?: boolean,
) {
  return (
    <div className="god-seat-row">
      <RowLabel n={row} />
      <div className="god-seat-groups">
        <div className="god-seat-group">
          {Array.from({ length: count }, (_, i) => i + 1).map((num) => {
            const seat = seatByKey(seats, `${sector}:${row}:${num}`);
            if (!seat) return null;
            return (
              <SeatButton
                key={seat.key}
                seat={seat}
                state={seatState(seat, occupied, selected)}
                onToggle={onToggle}
                disabled={disabled}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderVerticalColumn(
  seats: GardensSeat[],
  occupied: Set<string>,
  selected: Set<string>,
  onToggle: (key: string) => void,
  sector: GardensSeat["sector"],
  row: number,
  count: number,
  towardStage: "top" | "bottom",
  disabled?: boolean,
) {
  return (
    <div className="god-seat-col">
      <RowLabel n={row} />
      <div
        className={`god-seat-col-seats${towardStage === "top" ? " god-seat-col-seats--toward-top" : ""}`}
      >
        {Array.from({ length: count }, (_, i) => i + 1).map((num) => {
          const seat = seatByKey(seats, `${sector}:${row}:${num}`);
          if (!seat) return null;
          return (
            <SeatButton
              key={seat.key}
              seat={seat}
              state={seatState(seat, occupied, selected)}
              onToggle={onToggle}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  );
}

function renderAlignedStageRow() {
  const stage = row1StageLayoutFractions();
  const poolWidth = 1 - stage.poolLeft;
  const rel = (v: number) => `${(v / poolWidth) * 100}%`;
  const pct = (v: number) => `${v * 100}%`;

  return (
    <div className="god-seat-row god-stage-seat-row">
      <span className="god-row-label god-row-label--ghost" aria-hidden="true">
        ·
      </span>
      <div className="god-seat-groups god-stage-groups">
        {B_ROW1_GROUPS.map((group, gi) => (
          <div key={gi} className="god-seat-group god-stage-spacer" aria-hidden="true">
            {group.map((num) => (
              <span key={num} className="god-seat god-seat--ghost" />
            ))}
          </div>
        ))}
        <div
          className="god-stage-pool god-stage-pool--overlay"
          style={
            {
              "--stage-pool-left": pct(stage.poolLeft),
              "--stage-body-left": rel(stage.bodyLeft - stage.poolLeft),
              "--stage-body-width": rel(stage.bodyWidth),
              "--stage-platform-left": rel(stage.platformLeft - stage.poolLeft),
              "--stage-platform-width": rel(stage.platformWidth),
              "--stage-ramp-left": rel(stage.rampLeft - stage.poolLeft),
              "--stage-ramp-width": rel(stage.rampWidth),
            } as CSSProperties
          }
        >
          <div className="god-stage__body">СЦЕНА</div>
          <div className="god-stage__platform" aria-hidden="true" />
          <div className="god-stage__ramp" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

export function GardensSeatMap({
  seats,
  occupied,
  selected,
  onToggle,
  disabled,
}: GardensSeatMapProps) {
  return (
    <div className="god-map">
      <div className="god-map__legend" aria-label="Цены">
        <span className="god-legend-item god-legend-item--premium">150 BYN</span>
        <span className="god-legend-item god-legend-item--standard">120 BYN</span>
        <span className="god-legend-item god-legend-item--economy">90 BYN</span>
        <span className="god-legend-item god-legend-item--sold">Продано</span>
      </div>

      {/*
        Форма «П»: A и B — верхняя строка (выравнивание по верху),
        D и C — нижняя строка, сцена между B и C справа.
        ┌──┬──────────────
        │A │ B
        │  │ СЦЕНА
        │D │ C
        └──┴──────────────
      */}
      <div className="god-map__board">
        <div className="god-map__left god-map__left--top">
          <p className="god-sector-title">Сектор «A»</p>
          <div className="god-sector-vertical">
            {renderVerticalColumn(seats, occupied, selected, onToggle, "A", 3, 7, "bottom", disabled)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "A", 2, 6, "bottom", disabled)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "A", 1, 6, "bottom", disabled)}
          </div>
        </div>

        <div className="god-map__center god-map__center--top">
          <p className="god-sector-title">Сектор «B»</p>
          <div className="god-sector-rows">
            {renderFlatRow(seats, occupied, selected, onToggle, "B", 2, 37, disabled)}
            {renderGroupedRow(seats, occupied, selected, onToggle, B_ROW1_GROUPS, "B", 1, disabled)}
          </div>
        </div>

        <div className="god-map__stage-row">{renderAlignedStageRow()}</div>

        <div className="god-map__left god-map__left--bottom god-map__block--sold">
          <p className="god-sector-title">Сектор «D» — продано</p>
          <div className="god-sector-vertical god-sector-vertical--bottom">
            {renderVerticalColumn(seats, occupied, selected, onToggle, "D", 3, 7, "top", true)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "D", 2, 6, "top", true)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "D", 1, 6, "top", true)}
          </div>
        </div>

        <div className="god-map__center god-map__center--bottom god-map__block--sold">
          <p className="god-sector-title">Сектор «C» — продано</p>
          <div className="god-sector-rows">
            {renderGroupedRow(seats, occupied, selected, onToggle, C_ROW1_GROUPS, "C", 1, true)}
            {renderFlatRow(seats, occupied, selected, onToggle, "C", 2, 37, true)}
          </div>
        </div>
      </div>
    </div>
  );
}
