import type { EasingName } from "./schema";

type EasingFn = (t: number) => number;

/** Cubic-bezier control points for every named easing (CSS / easings.net values). */
export const EASING_BEZIERS: Record<Exclude<EasingName, "custom" | "hold" | "linear">, [number, number, number, number]> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  easeInCubic: [0.32, 0, 0.67, 0],
  easeOutCubic: [0.33, 1, 0.68, 1],
  easeInOutCubic: [0.65, 0, 0.35, 1],
  easeInQuart: [0.5, 0, 0.75, 0],
  easeOutQuart: [0.25, 1, 0.5, 1],
  easeInOutQuart: [0.76, 0, 0.24, 1],
  easeInExpo: [0.7, 0, 0.84, 0],
  easeOutExpo: [0.16, 1, 0.3, 1],
  easeInOutExpo: [0.87, 0, 0.13, 1],
  easeInBack: [0.36, 0, 0.66, -0.56],
  easeOutBack: [0.34, 1.56, 0.64, 1],
  easeInOutBack: [0.68, -0.6, 0.32, 1.6],
};

/** CSS-style cubic-bezier timing function (Newton-Raphson with bisection fallback). Pure: safe on server and client. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveT = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solveT(x)));
}

const cache = new Map<string, EasingFn>();

export function easingFn(name: EasingName, bezier?: number[] | null): EasingFn {
  if (name === "linear") return (t) => t;
  if (name === "hold") return (t) => (t >= 1 ? 1 : 0);
  const pts =
    name === "custom"
      ? bezier && bezier.length === 4
        ? (bezier as [number, number, number, number])
        : EASING_BEZIERS.easeInOut
      : EASING_BEZIERS[name];
  const key = pts.join(",");
  let fn = cache.get(key);
  if (!fn) {
    fn = cubicBezier(pts[0], pts[1], pts[2], pts[3]);
    cache.set(key, fn);
  }
  return fn;
}
