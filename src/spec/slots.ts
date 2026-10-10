import type { MotionSpec, Slot, SlotValues } from "./schema";

export type ResolvedSlot = {
  slot: Slot | null;
  text: string | null;
  src: string | null;
  color: string | null;
  /** True when the user replaced the default. */
  overridden: boolean;
  /** True when the media is the original reference footage (use its source timing). */
  isDefaultFootage: boolean;
};

export function toUrl(pathOrUrl: string, assetBase: string): string {
  if (/^(https?:|data:|blob:|\/)/.test(pathOrUrl)) return pathOrUrl;
  return assetBase + pathOrUrl.replace(/\\/g, "/");
}

export function resolveSlot(spec: MotionSpec, values: SlotValues, slotId: string | null, assetBase: string): ResolvedSlot {
  const slot = slotId ? spec.slots.find((s) => s.id === slotId) ?? null : null;
  const v = slotId ? values[slotId] : undefined;
  const userSrc = v?.src ?? null;
  const src = userSrc ?? slot?.defaultSrc ?? null;
  return {
    slot,
    text: v?.text ?? slot?.defaultText ?? null,
    src: src ? toUrl(src, assetBase) : null,
    color: v?.color ?? slot?.defaultColor ?? null,
    overridden: Boolean(v && (v.text != null || v.src != null || v.color != null)),
    isDefaultFootage: !userSrc && slot?.kind === "video" && Boolean(slot.defaultSrc),
  };
}
