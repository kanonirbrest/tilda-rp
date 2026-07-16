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
  /**
   * admin-sale: места не в продаже кликабельны (выставить),
   * места в продаже (свободные) кликабельны (снять), занятые — нет.
   */
  mode?: "buy" | "admin-sale";
};

function seatByKey(seats: GardensSeat[], key: string): GardensSeat | undefined {
  return seats.find((s) => s.key === key);
}

function seatState(
  seat: GardensSeat,
  occupied: Set<string>,
  selected: Set<string>,
  mode: "buy" | "admin-sale",
): "sold" | "selected" | "offsale" | GardensSeatTier {
  if (occupied.has(seat.key)) return "sold";
  if (mode === "admin-sale") {
    if (!seat.selectable) return "offsale";
    return seat.tier;
  }
  if (!seat.selectable) return "sold";
  if (selected.has(seat.key)) return "selected";
  return seat.tier;
}

function SeatButton({
  seat,
  state,
  onToggle,
  disabled,
  mode,
}: {
  seat: GardensSeat;
  state: ReturnType<typeof seatState>;
  onToggle: (key: string) => void;
  disabled?: boolean;
  mode: "buy" | "admin-sale";
}) {
  const isOffSale = state === "offsale";
  const isBlockedBuy = mode === "buy" && state === "sold";
  const clickDisabled = Boolean(disabled || (mode === "admin-sale" ? state === "sold" : isBlockedBuy));

  let title: string;
  if (state === "sold") {
    title = `${seat.label} — ${occupiedSoldLabel(seat, mode)}`;
  } else if (isOffSale) {
    title = `${seat.label} — не в продаже (нажмите, чтобы выставить)`;
  } else if (mode === "admin-sale") {
    title = `${seat.label} — в продаже, ${seat.priceCents / 100} BYN (нажмите, чтобы снять)`;
  } else {
    title = `${seat.label} — ${seat.priceCents / 100} BYN`;
  }

  return (
    <button
      type="button"
      className={`god-seat god-seat--${state}`}
      aria-label={seat.label}
      aria-pressed={state === "selected"}
      disabled={clickDisabled}
      title={title}
      onClick={() => onToggle(seat.key)}
    >
      {seat.seat}
    </button>
  );
}

function occupiedSoldLabel(seat: GardensSeat, mode: "buy" | "admin-sale"): string {
  if (seat.selectable) return "занято";
  return mode === "admin-sale" ? "занято" : "продано";
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
  disabled: boolean | undefined,
  mode: "buy" | "admin-sale",
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
                  state={seatState(seat, occupied, selected, mode)}
                  onToggle={onToggle}
                  disabled={disabled}
                  mode={mode}
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
  disabled: boolean | undefined,
  mode: "buy" | "admin-sale",
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
                state={seatState(seat, occupied, selected, mode)}
                onToggle={onToggle}
                disabled={disabled}
                mode={mode}
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
  disabled: boolean | undefined,
  mode: "buy" | "admin-sale",
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
              state={seatState(seat, occupied, selected, mode)}
              onToggle={onToggle}
              disabled={disabled}
              mode={mode}
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
  mode = "buy",
}: GardensSeatMapProps) {
  const sectorDHasSale = mode === "admin-sale" || seats.some((s) => s.sector === "D" && s.selectable);

  return (
    <div className="god-map">
      <div className="god-map__legend" aria-label="Цены">
        <span className="god-legend-item god-legend-item--premium">150 BYN</span>
        <span className="god-legend-item god-legend-item--standard">120 BYN</span>
        <span className="god-legend-item god-legend-item--economy">90 BYN</span>
        {mode === "admin-sale" ? (
          <span className="god-legend-item god-legend-item--offsale">Не в продаже</span>
        ) : null}
        <span className="god-legend-item god-legend-item--sold">
          {mode === "admin-sale" ? "Занято" : "Продано"}
        </span>
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
            {renderVerticalColumn(seats, occupied, selected, onToggle, "A", 3, 7, "bottom", disabled, mode)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "A", 2, 6, "bottom", disabled, mode)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "A", 1, 6, "bottom", disabled, mode)}
          </div>
        </div>

        <div className="god-map__center god-map__center--top">
          <p className="god-sector-title">Сектор «B»</p>
          <div className="god-sector-rows">
            {renderFlatRow(seats, occupied, selected, onToggle, "B", 2, 37, disabled, mode)}
            {renderGroupedRow(seats, occupied, selected, onToggle, B_ROW1_GROUPS, "B", 1, disabled, mode)}
          </div>
        </div>

        <div className="god-map__stage-row">{renderAlignedStageRow()}</div>

        <div
          className={`god-map__left god-map__left--bottom${sectorDHasSale ? "" : " god-map__block--sold"}`}
        >
          <p className="god-sector-title">
            {sectorDHasSale ? "Сектор «D»" : "Сектор «D» — продано"}
          </p>
          <div className="god-sector-vertical god-sector-vertical--bottom">
            {renderVerticalColumn(seats, occupied, selected, onToggle, "D", 3, 7, "top", disabled, mode)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "D", 2, 6, "top", disabled, mode)}
            {renderVerticalColumn(seats, occupied, selected, onToggle, "D", 1, 6, "top", disabled, mode)}
          </div>
        </div>

        <div className="god-map__center god-map__center--bottom">
          <p className="god-sector-title">Сектор «C»</p>
          <div className="god-sector-rows">
            {renderGroupedRow(seats, occupied, selected, onToggle, C_ROW1_GROUPS, "C", 1, disabled, mode)}
            {renderFlatRow(seats, occupied, selected, onToggle, "C", 2, 37, disabled, mode)}
          </div>
        </div>
      </div>
    </div>
  );
}
