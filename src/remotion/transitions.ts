import type { CSSProperties } from "react";
import { easingFn } from "../spec/easing";
import type { Transition } from "../spec/schema";

/** Style applied to an incoming shot during its transition-in window. `frame` is shot-relative. */
export function transitionStyle(t: Transition, frame: number): CSSProperties {
  if (t.kind === "cut" || t.durationInFrames <= 0 || frame >= t.durationInFrames) return {};
  const p = easingFn(t.easing)(Math.max(0, frame) / t.durationInFrames);
  const inv = (1 - p) * 100;
  switch (t.kind) {
    case "fade":
      return { opacity: p };
    case "slideLeft":
      return { transform: `translateX(${inv}%)` };
    case "slideRight":
      return { transform: `translateX(${-inv}%)` };
    case "slideUp":
      return { transform: `translateY(${inv}%)` };
    case "slideDown":
      return { transform: `translateY(${-inv}%)` };
    case "wipeLeft":
      return { clipPath: `inset(0 0 0 ${inv}%)` };
    case "wipeRight":
      return { clipPath: `inset(0 ${inv}% 0 0)` };
    case "wipeUp":
      return { clipPath: `inset(${inv}% 0 0 0)` };
    case "wipeDown":
      return { clipPath: `inset(0 0 ${inv}% 0)` };
    case "zoomIn":
      return { opacity: p, transform: `scale(${0.6 + 0.4 * p})` };
    case "zoomOut":
      return { opacity: p, transform: `scale(${1.4 - 0.4 * p})` };
    case "blur":
      return { opacity: p, filter: `blur(${(1 - p) * 40}px)` };
    default:
      return {};
  }
}
