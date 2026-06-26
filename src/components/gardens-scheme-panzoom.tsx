"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const MOBILE_MQ = "(max-width: 767px)";
const MAX_ZOOM_FACTOR = 3;
const PAN_THRESHOLD_PX = 6;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST_PX = 32;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

type TouchPoint = { clientX: number; clientY: number };
type Transform = { x: number; y: number; scale: number };
type Size = { w: number; h: number };

type SafariGestureEvent = Event & {
  scale: number;
  clientX: number;
  clientY: number;
};

function touchDistance(a: TouchPoint, b: TouchPoint): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMidpoint(a: TouchPoint, b: TouchPoint): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

function formatTransform({ x, y, scale }: Transform): string {
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

function readMobileMq(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(MOBILE_MQ).matches;
}

function computeFitTransform(viewport: Size, content: Size): Transform {
  const scale = Math.min(viewport.w / content.w, viewport.h / content.h);
  return {
    scale,
    x: (viewport.w - content.w * scale) / 2,
    y: (viewport.h - content.h * scale) / 2,
  };
}

function clampPan({ x, y, scale }: Transform, viewport: Size, content: Size): Transform {
  const scaledW = content.w * scale;
  const scaledH = content.h * scale;
  const minX = Math.min(0, viewport.w - scaledW);
  const maxX = Math.max(0, viewport.w - scaledW);
  const minY = Math.min(0, viewport.h - scaledH);
  const maxY = Math.max(0, viewport.h - scaledH);
  return {
    scale,
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

/** Ticketpro-style pan/zoom: inline transform на контейнере схемы. */
export function GardensSchemePanzoom({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const minScaleRef = useRef(1);
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const fitTransformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const contentSizeRef = useRef<Size>({ w: 0, h: 0 });
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const panRef = useRef<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const touchMovedRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const gestureStartScaleRef = useRef(1);
  const mobileRef = useRef(readMobileMq());

  const [mobile, setMobile] = useState(readMobileMq);
  const [transformStyle, setTransformStyle] = useState<string>();

  const getViewportSize = useCallback((): Size | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    if (!w || !h) return null;
    return { w, h };
  }, []);

  const getContentSize = useCallback((): Size | null => {
    const content = contentRef.current;
    if (!content) return null;
    const w = content.offsetWidth;
    const h = content.offsetHeight;
    if (!w || !h) return null;
    return { w, h };
  }, []);

  const applyTransform = useCallback((next?: Transform) => {
    const el = contentRef.current;
    if (!el) return;
    if (next) transformRef.current = next;
    const t = transformRef.current;
    const style = formatTransform(t);
    el.style.transform = style;
    setTransformStyle(style);
  }, []);

  const clampScale = useCallback((scale: number) => {
    const min = minScaleRef.current;
    return Math.min(min * MAX_ZOOM_FACTOR, Math.max(min, scale));
  }, []);

  const commitTransform = useCallback(
    (next: Transform) => {
      const viewport = getViewportSize();
      const content = getContentSize();
      if (!viewport || !content) {
        applyTransform(next);
        return;
      }
      applyTransform(
        clampPan({ ...next, scale: clampScale(next.scale) }, viewport, content),
      );
    },
    [applyTransform, clampScale, getContentSize, getViewportSize],
  );

  const setTransformAt = useCallback(
    (nextScale: number, focalX: number, focalY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const { scale: s0, x: x0, y: y0 } = transformRef.current;
      const s1 = clampScale(nextScale);
      const vx = focalX - rect.left;
      const vy = focalY - rect.top;
      const cx = (vx - x0) / s0;
      const cy = (vy - y0) / s0;
      commitTransform({
        scale: s1,
        x: vx - cx * s1,
        y: vy - cy * s1,
      });
    },
    [clampScale, commitTransform],
  );

  const resetToFit = useCallback(() => {
    commitTransform({ ...fitTransformRef.current });
  }, [commitTransform]);

  const toggleDoubleTapZoom = useCallback(
    (clientX: number, clientY: number) => {
      const fit = fitTransformRef.current;
      const { scale } = transformRef.current;
      if (scale <= fit.scale * 1.12) {
        setTransformAt(Math.min(fit.scale * 2, fit.scale * MAX_ZOOM_FACTOR), clientX, clientY);
      } else {
        resetToFit();
      }
    },
    [resetToFit, setTransformAt],
  );

  const fitToViewport = useCallback(
    (force = false) => {
      const viewport = getViewportSize();
      const content = getContentSize();
      if (!viewport || !content) return;

      const sizeChanged =
        contentSizeRef.current.w !== content.w || contentSizeRef.current.h !== content.h;
      contentSizeRef.current = content;

      const fit = computeFitTransform(viewport, content);
      minScaleRef.current = fit.scale;
      fitTransformRef.current = fit;

      if (!force && sizeChanged && transformRef.current.scale > fit.scale * 1.02) {
        const ratio = fit.scale / transformRef.current.scale;
        commitTransform({
          scale: transformRef.current.scale * ratio,
          x: transformRef.current.x * ratio + fit.x * (1 - ratio),
          y: transformRef.current.y * ratio + fit.y * (1 - ratio),
        });
        return;
      }

      if (!force && transformRef.current.scale > fit.scale * 1.02 && !sizeChanged) return;

      commitTransform(fit);
    },
    [commitTransform, getContentSize, getViewportSize],
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const sync = () => {
      mobileRef.current = mq.matches;
      setMobile(mq.matches);
      fitToViewport(true);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [fitToViewport]);

  useEffect(() => {
    if (!mobile) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onTouchStart = (e: TouchEvent) => {
      touchMovedRef.current = false;
      if (e.touches.length === 2) {
        e.preventDefault();
        panRef.current = null;
        lastTapRef.current = null;
        pinchRef.current = {
          dist: touchDistance(e.touches[0]!, e.touches[1]!),
          scale: transformRef.current.scale,
        };
        return;
      }

      if (e.touches.length === 1) {
        pinchRef.current = null;
        const t = e.touches[0]!;
        panRef.current = {
          pointerX: t.clientX,
          pointerY: t.clientY,
          originX: transformRef.current.x,
          originY: transformRef.current.y,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dist = touchDistance(e.touches[0]!, e.touches[1]!);
        const mid = touchMidpoint(e.touches[0]!, e.touches[1]!);
        const ratio = dist / pinchRef.current.dist;
        setTransformAt(pinchRef.current.scale * ratio, mid.x, mid.y);
        touchMovedRef.current = true;
        return;
      }

      if (e.touches.length === 1 && panRef.current) {
        const t = e.touches[0]!;
        const dx = t.clientX - panRef.current.pointerX;
        const dy = t.clientY - panRef.current.pointerY;
        if (!touchMovedRef.current && Math.hypot(dx, dy) < PAN_THRESHOLD_PX) return;
        e.preventDefault();
        touchMovedRef.current = true;
        commitTransform({
          ...transformRef.current,
          x: panRef.current.originX + dx,
          y: panRef.current.originY + dy,
        });
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      pinchRef.current = null;
      panRef.current = null;

      if (touchMovedRef.current || e.changedTouches.length !== 1) return;

      const t = e.changedTouches[0]!;
      const now = Date.now();
      const last = lastTapRef.current;

      if (
        last &&
        now - last.time < DOUBLE_TAP_MS &&
        Math.hypot(t.clientX - last.x, t.clientY - last.y) < DOUBLE_TAP_DIST_PX
      ) {
        e.preventDefault();
        lastTapRef.current = null;
        toggleDoubleTapZoom(t.clientX, t.clientY);
        return;
      }

      lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
      setTransformAt(transformRef.current.scale * factor, e.clientX, e.clientY);
    };

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStartScaleRef.current = transformRef.current.scale;
    };

    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as SafariGestureEvent;
      setTransformAt(gestureStartScaleRef.current * ge.scale, ge.clientX, ge.clientY);
    };

    const onGestureEnd = (e: Event) => {
      e.preventDefault();
    };

    const onDoubleClick = (e: MouseEvent) => {
      e.preventDefault();
      lastTapRef.current = null;
      toggleDoubleTapZoom(e.clientX, e.clientY);
    };

    const capture = { capture: true, passive: false } as const;
    const capturePassive = { capture: true } as const;

    viewport.addEventListener("touchstart", onTouchStart, capture);
    viewport.addEventListener("touchmove", onTouchMove, capture);
    viewport.addEventListener("touchend", onTouchEnd, capture);
    viewport.addEventListener("touchcancel", onTouchEnd, capture);
    viewport.addEventListener("wheel", onWheel, capture);
    viewport.addEventListener("gesturestart", onGestureStart, capturePassive);
    viewport.addEventListener("gesturechange", onGestureChange, capturePassive);
    viewport.addEventListener("gestureend", onGestureEnd, capturePassive);
    viewport.addEventListener("dblclick", onDoubleClick);

    return () => {
      viewport.removeEventListener("touchstart", onTouchStart, capture);
      viewport.removeEventListener("touchmove", onTouchMove, capture);
      viewport.removeEventListener("touchend", onTouchEnd, capture);
      viewport.removeEventListener("touchcancel", onTouchEnd, capture);
      viewport.removeEventListener("wheel", onWheel, capture);
      viewport.removeEventListener("gesturestart", onGestureStart, capturePassive);
      viewport.removeEventListener("gesturechange", onGestureChange, capturePassive);
      viewport.removeEventListener("gestureend", onGestureEnd, capturePassive);
      viewport.removeEventListener("dblclick", onDoubleClick);
    };
  }, [commitTransform, mobile, setTransformAt, toggleDoubleTapZoom]);

  useEffect(() => {
    if (!mobile) return;
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content) return;

    const run = () => requestAnimationFrame(() => fitToViewport());
    run();

    const ro = new ResizeObserver(run);
    ro.observe(content);
    if (viewport) ro.observe(viewport);

    const onOrientationChange = () => setTimeout(() => fitToViewport(true), 100);
    window.addEventListener("orientationchange", onOrientationChange);

    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, [fitToViewport, mobile, children]);

  if (!mobile) {
    return <>{children}</>;
  }

  return (
    <div ref={viewportRef} className="god-scheme-panzoom">
      <div
        ref={contentRef}
        className="god-scheme-panzoom__content"
        style={transformStyle ? { transform: transformStyle } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
