import { EASING_BEZIERS } from "./easing";
import type { Layer, MotionSpec, Shot, Track } from "./schema";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback);

function cleanTracks(tracks: Track[], duration: number): Track[] {
  const byProp = new Map<string, Track>();
  for (const t of tracks) {
    const keys = t.keys
      .filter((k) => Number.isFinite(k.frame) && Number.isFinite(k.value))
      .map((k) => ({
        ...k,
        frame: clamp(k.frame, -duration, duration * 2),
        bezier: k.easing === "custom" ? (k.bezier?.length === 4 ? k.bezier : [...EASING_BEZIERS.easeInOut]) : null,
      }))
      .sort((a, b) => a.frame - b.frame);
    if (keys.length === 0) continue;
    // Duplicate prop tracks: merge keys.
    const existing = byProp.get(t.prop);
    if (existing) existing.keys = [...existing.keys, ...keys].sort((a, b) => a.frame - b.frame);
    else byProp.set(t.prop, { prop: t.prop, keys });
  }
  return [...byProp.values()];
}

export function sanitizeLayers(layers: Layer[], duration: number): Layer[] {
  const seen = new Set<string>();
  return layers.map((l, i) => {
    let id = l.id || `layer${i}`;
    while (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const inFrame = clamp(Math.round(finite(l.inFrame, 0)), 0, duration);
    const outFrame = clamp(Math.round(finite(l.outFrame, duration)), inFrame + 1, duration + 1000);
    return {
      ...l,
      id,
      inFrame,
      outFrame,
      base: {
        x: finite(l.base.x, 0.5),
        y: finite(l.base.y, 0.5),
        width: Math.max(0.001, finite(l.base.width, 0.5)),
        height: Math.max(0.001, finite(l.base.height, 0.1)),
        scale: finite(l.base.scale, 1),
        rotation: finite(l.base.rotation, 0),
        opacity: clamp(finite(l.base.opacity, 1), 0, 1),
        blur: Math.max(0, finite(l.base.blur, 0)),
      },
      tracks: cleanTracks(l.tracks, duration),
      style: l.type === "text" ? l.style : null,
      textAnim: l.type === "text" ? l.textAnim : null,
      shape: l.type === "shape" ? l.shape : null,
    };
  });
}

export function sanitizeShot(shot: Shot): Shot {
  const d = shot.durationInFrames;
  return {
    ...shot,
    transitionIn: {
      ...shot.transitionIn,
      durationInFrames: shot.transitionIn.kind === "cut" ? 0 : clamp(Math.round(shot.transitionIn.durationInFrames), 1, Math.max(1, d)),
    },
    camera: cleanTracks(shot.camera, d),
    layers: sanitizeLayers(shot.layers, d),
  };
}

export function sanitizeSpec(spec: MotionSpec): MotionSpec {
  const shots = spec.shots.map(sanitizeShot);
  const slotIds = new Set(spec.slots.map((s) => s.id));
  for (const s of shots) for (const l of s.layers) if (l.slotId && !slotIds.has(l.slotId)) l.slotId = null;
  return { ...spec, shots };
}
