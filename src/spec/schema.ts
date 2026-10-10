import { z } from "zod";

/**
 * MotionSpec — the single contract between analysis (Claude) and rendering (Remotion).
 *
 * Conventions (Claude is told these verbatim in the prompts):
 *  - Geometry is normalized: x/y are the layer CENTER as a fraction of frame width/height,
 *    width/height are fractions of frame width/height. Resolution independent.
 *  - fontSize is a fraction of frame height.
 *  - Keyframe `frame` is relative to the start of the shot it lives in.
 *  - A keyframe's `easing` describes the segment ARRIVING at that key from the previous key.
 *  - Schemas are flat (no recursion) and use nullable instead of optional, because
 *    structured outputs reject recursive schemas and work best with every key required.
 */

export const ANIMATABLE_PROPS = [
  "x",
  "y",
  "width",
  "height",
  "scale",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "blur",
  "clipLeft",
  "clipRight",
  "clipTop",
  "clipBottom",
] as const;
export const AnimatablePropSchema = z.enum(ANIMATABLE_PROPS);
export type AnimatableProp = z.infer<typeof AnimatablePropSchema>;

export const EASINGS = [
  "linear",
  "hold",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeInCubic",
  "easeOutCubic",
  "easeInOutCubic",
  "easeInQuart",
  "easeOutQuart",
  "easeInOutQuart",
  "easeInExpo",
  "easeOutExpo",
  "easeInOutExpo",
  "easeInBack",
  "easeOutBack",
  "easeInOutBack",
  "custom",
] as const;
export const EasingSchema = z.enum(EASINGS);
export type EasingName = z.infer<typeof EasingSchema>;

export const KeyframeSchema = z.object({
  frame: z.number().describe("Frame relative to shot start"),
  value: z.number(),
  easing: EasingSchema.describe("Easing of the segment arriving at this key"),
  bezier: z
    .array(z.number())
    .nullable()
    .describe("[x1,y1,x2,y2] cubic-bezier, only when easing is 'custom'"),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const TrackSchema = z.object({
  prop: AnimatablePropSchema,
  keys: z.array(KeyframeSchema),
});
export type Track = z.infer<typeof TrackSchema>;

export const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  scale: z.number(),
  rotation: z.number().describe("Degrees, clockwise"),
  opacity: z.number(),
  blur: z.number().describe("Gaussian blur in px at spec resolution"),
});
export type Transform = z.infer<typeof TransformSchema>;

export const TextStyleSchema = z.object({
  fontFamily: z.string().describe("Closest Google Font family name"),
  fontWeight: z.number(),
  fontSize: z.number().describe("Fraction of frame height"),
  color: z.string(),
  letterSpacing: z.number().describe("em units"),
  lineHeight: z.number(),
  align: z.enum(["left", "center", "right"]),
  textTransform: z.enum(["none", "uppercase", "lowercase"]),
  italic: z.boolean(),
  strokeColor: z.string().nullable(),
  strokeWidth: z.number().nullable(),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const ShapeSchema = z.object({
  kind: z.enum(["rect", "ellipse", "line"]),
  fill: z.string().nullable(),
  stroke: z.string().nullable(),
  strokeWidth: z.number().nullable().describe("px at spec resolution"),
  radius: z.number().nullable().describe("Corner radius as fraction of the shape's shorter side"),
});
export type Shape = z.infer<typeof ShapeSchema>;

export const TextAnimSchema = z.object({
  unit: z.enum(["char", "word", "line"]),
  startFrame: z.number(),
  staggerFrames: z.number(),
  durationFrames: z.number().describe("Duration of each unit's animation"),
  easing: EasingSchema,
  from: z.object({
    opacity: z.number(),
    offsetX: z.number().describe("Fraction of frame width"),
    offsetY: z.number().describe("Fraction of frame height"),
    scale: z.number(),
    rotation: z.number(),
    blur: z.number(),
  }),
});
export type TextAnim = z.infer<typeof TextAnimSchema>;

export const LayerSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "video", "shape"]),
  name: z.string().describe("Short human label, e.g. 'headline', 'logo', 'accent bar'"),
  slotId: z.string().nullable().describe("Replaceable asset slot this layer draws from"),
  z: z.number().describe("Stacking order, higher is on top"),
  inFrame: z.number().describe("First visible frame, relative to shot start"),
  outFrame: z.number().describe("Last visible frame (exclusive), relative to shot start"),
  text: z.string().nullable().describe("Literal text when not driven by a slot"),
  style: TextStyleSchema.nullable(),
  textAnim: TextAnimSchema.nullable(),
  shape: ShapeSchema.nullable(),
  fit: z.enum(["cover", "contain", "fill"]).nullable(),
  borderRadius: z.number().nullable().describe("Fraction of the layer's shorter side"),
  blendMode: z.enum(["normal", "multiply", "screen", "overlay", "add"]).nullable(),
  base: TransformSchema,
  tracks: z.array(TrackSchema),
});
export type Layer = z.infer<typeof LayerSchema>;

export const BackgroundSchema = z.object({
  kind: z.enum(["solid", "linear", "radial", "transparent"]),
  colors: z.array(z.string()),
  angle: z.number().describe("Degrees, for linear gradients"),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const TRANSITIONS = [
  "cut",
  "fade",
  "slideLeft",
  "slideRight",
  "slideUp",
  "slideDown",
  "wipeLeft",
  "wipeRight",
  "wipeUp",
  "wipeDown",
  "zoomIn",
  "zoomOut",
  "blur",
] as const;
export const TransitionSchema = z.object({
  kind: z.enum(TRANSITIONS),
  durationInFrames: z.number(),
  easing: EasingSchema,
});
export type Transition = z.infer<typeof TransitionSchema>;

export const ShotSchema = z.object({
  id: z.string(),
  from: z.number().describe("Absolute start frame"),
  durationInFrames: z.number(),
  description: z.string(),
  background: BackgroundSchema,
  transitionIn: TransitionSchema,
  camera: z.array(TrackSchema).describe("Whole-shot camera moves: x/y pan offsets, scale zoom, rotation"),
  layers: z.array(LayerSchema),
});
export type Shot = z.infer<typeof ShotSchema>;

export const SLOT_KINDS = ["image", "video", "text", "color"] as const;
export const SlotSchema = z.object({
  id: z.string(),
  kind: z.enum(SLOT_KINDS),
  label: z.string(),
  description: z.string(),
  defaultText: z.string().nullable(),
  defaultSrc: z.string().nullable().describe("Path relative to the job dir"),
  defaultColor: z.string().nullable(),
  /** For default footage: frame in the reference video where the clip starts. */
  sourceFrom: z.number().nullable(),
  aspect: z.number().nullable().describe("width / height of the region"),
});
export type Slot = z.infer<typeof SlotSchema>;

export const MotionSpecSchema = z.object({
  version: z.literal(1),
  title: z.string(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
  durationInFrames: z.number(),
  fonts: z.array(z.string()),
  palette: z.array(z.string()),
  audio: z.object({ src: z.string(), keep: z.boolean() }).nullable(),
  slots: z.array(SlotSchema),
  shots: z.array(ShotSchema),
});
export type MotionSpec = z.infer<typeof MotionSpecSchema>;

/** What the user supplies per slot. Keys are slot ids. */
export const SlotValueSchema = z.object({
  text: z.string().nullable().optional(),
  src: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});
export type SlotValue = z.infer<typeof SlotValueSchema>;
export type SlotValues = Record<string, SlotValue>;

/** Props for the <SpecVideo> composition. */
export type SpecVideoProps = {
  spec: MotionSpec;
  values: SlotValues;
  /** Prefix that turns job-relative paths into URLs (e.g. "/api/files/<jobId>/"). */
  assetBase: string;
  /** Show slot outlines + labels (editor preview). */
  debug?: boolean;
};
