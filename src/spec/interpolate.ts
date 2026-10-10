import { easingFn } from "./easing";
import type { AnimatableProp, Keyframe, Layer, Track, Transform } from "./schema";

/** Value of a keyframe track at `frame` (shot-relative). Holds first/last values outside the range. */
export function sampleTrack(keys: Keyframe[], frame: number, fallback: number): number {
  if (keys.length === 0) return fallback;
  const sorted = keys.length > 1 && !isSorted(keys) ? [...keys].sort((a, b) => a.frame - b.frame) : keys;
  if (frame <= sorted[0].frame) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (frame >= last.frame) return last.value;
  for (let i = 1; i < sorted.length; i++) {
    const b = sorted[i];
    if (frame <= b.frame) {
      const a = sorted[i - 1];
      const span = b.frame - a.frame;
      if (span <= 0) return b.value;
      const t = easingFn(b.easing, b.bezier)((frame - a.frame) / span);
      return a.value + (b.value - a.value) * t;
    }
  }
  return last.value;
}

function isSorted(keys: Keyframe[]): boolean {
  for (let i = 1; i < keys.length; i++) if (keys[i].frame < keys[i - 1].frame) return false;
  return true;
}

export type ResolvedTransform = Transform & {
  scaleX: number;
  scaleY: number;
  clipLeft: number;
  clipRight: number;
  clipTop: number;
  clipBottom: number;
};

const DEFAULTS: Record<AnimatableProp, number> = {
  x: 0.5,
  y: 0.5,
  width: 1,
  height: 1,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
  blur: 0,
  clipLeft: 0,
  clipRight: 0,
  clipTop: 0,
  clipBottom: 0,
};

/** Resolve every animatable property of a layer (or camera) at a shot-relative frame. */
export function resolveTransform(base: Partial<Transform>, tracks: Track[], frame: number): ResolvedTransform {
  const out = { ...DEFAULTS, ...base } as ResolvedTransform;
  for (const track of tracks) {
    out[track.prop] = sampleTrack(track.keys, frame, out[track.prop]);
  }
  return out;
}

export function resolveLayer(layer: Layer, frame: number): ResolvedTransform {
  return resolveTransform(layer.base, layer.tracks, frame);
}
