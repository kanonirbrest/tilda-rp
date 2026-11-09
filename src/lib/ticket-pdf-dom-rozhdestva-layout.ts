/** Координаты в CSS-пикселях макета 797×1123. В PDF переводятся по размеру страницы. */
export type DomShellField = {
  /** Якорь по X: центр строки или левый край. */
  x: number;
  /** Расстояние от верха листа до базовой линии текста. */
  baseline: number;
  size: number;
  weight: 400 | 700;
  align: "left" | "center";
  /** Ограничение ширины строки. `null`, если в вёрстке ширина не задана. */
  maxWidth: number | null;
};

export type DomShellLayout = {
  cssWidth: number;
  cssHeight: number;
  fields: {
    date: DomShellField;
    time: DomShellField;
    type: DomShellField;
    price: DomShellField;
    order: DomShellField;
  };
  qr: { x: number; y: number; size: number };
};
