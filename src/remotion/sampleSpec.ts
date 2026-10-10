import type { Layer, MotionSpec } from "../spec/schema";

/** Hand-written spec that exercises every renderer feature; used by Remotion Studio and `npm run sample`. */

const base = { x: 0.5, y: 0.5, width: 0.8, height: 0.2, scale: 1, rotation: 0, opacity: 1, blur: 0 };
const noText = { text: null, style: null, textAnim: null, shape: null, fit: null, borderRadius: null, blendMode: null };

const headline: Layer = {
  ...noText,
  id: "s1-headline",
  type: "text",
  name: "headline",
  slotId: "headline",
  z: 2,
  inFrame: 0,
  outFrame: 75,
  style: {
    fontFamily: "Montserrat",
    fontWeight: 800,
    fontSize: 0.11,
    color: "#ffffff",
    letterSpacing: -0.02,
    lineHeight: 1,
    align: "center",
    textTransform: "uppercase",
    italic: false,
    strokeColor: null,
    strokeWidth: null,
  },
  textAnim: {
    unit: "char",
    startFrame: 4,
    staggerFrames: 1.5,
    durationFrames: 14,
    easing: "easeOutBack",
    from: { opacity: 0, offsetX: 0, offsetY: 0.06, scale: 0.6, rotation: 0, blur: 8 },
  },
  base: { ...base, y: 0.46 },
  tracks: [
    { prop: "y", keys: [{ frame: 50, value: 0.46, easing: "linear", bezier: null }, { frame: 70, value: 0.3, easing: "easeInExpo", bezier: null }] },
    { prop: "opacity", keys: [{ frame: 58, value: 1, easing: "linear", bezier: null }, { frame: 72, value: 0, easing: "easeIn", bezier: null }] },
  ],
};

const bar: Layer = {
  ...noText,
  id: "s1-bar",
  type: "shape",
  name: "accent bar",
  slotId: "accent",
  z: 1,
  inFrame: 0,
  outFrame: 75,
  shape: { kind: "rect", fill: "#ff2d75", stroke: null, strokeWidth: null, radius: 0.5 },
  base: { ...base, y: 0.6, width: 0.3, height: 0.012 },
  tracks: [
    { prop: "scaleX", keys: [{ frame: 10, value: 0, easing: "linear", bezier: null }, { frame: 28, value: 1, easing: "easeOutExpo", bezier: null }] },
  ],
};

const logo: Layer = {
  ...noText,
  id: "s2-logo",
  type: "image",
  name: "logo",
  slotId: "logo",
  z: 2,
  inFrame: 0,
  outFrame: 75,
  fit: "contain",
  base: { ...base, width: 0.25, height: 0.25 },
  tracks: [
    { prop: "scale", keys: [{ frame: 0, value: 0.4, easing: "linear", bezier: null }, { frame: 20, value: 1, easing: "easeOutBack", bezier: null }] },
    { prop: "rotation", keys: [{ frame: 0, value: -20, easing: "linear", bezier: null }, { frame: 20, value: 0, easing: "easeOutCubic", bezier: null }] },
  ],
};

const tagline: Layer = {
  ...headline,
  id: "s2-tagline",
  name: "tagline",
  slotId: "tagline",
  style: { ...headline.style!, fontSize: 0.05, fontWeight: 500, textTransform: "none", letterSpacing: 0.05 },
  textAnim: { unit: "word", startFrame: 18, staggerFrames: 4, durationFrames: 12, easing: "easeOutCubic", from: { opacity: 0, offsetX: 0, offsetY: 0.03, scale: 1, rotation: 0, blur: 0 } },
  base: { ...base, y: 0.72 },
  tracks: [],
};

export const sampleSpec: MotionSpec = {
  version: 1,
  title: "Sample promo",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 150,
  fonts: ["Montserrat"],
  palette: ["#0b0b12", "#ff2d75", "#ffffff"],
  audio: null,
  slots: [
    { id: "headline", kind: "text", label: "Headline", description: "Big opening title", defaultText: "Motion Matters", defaultSrc: null, defaultColor: null, sourceFrom: null, aspect: null },
    { id: "tagline", kind: "text", label: "Tagline", description: "Line under the logo", defaultText: "Built frame by frame", defaultSrc: null, defaultColor: null, sourceFrom: null, aspect: null },
    { id: "logo", kind: "image", label: "Logo", description: "Brand mark, centered", defaultText: null, defaultSrc: "https://dummyimage.com/600x600/ff2d75/ffffff.png&text=LOGO", defaultColor: null, sourceFrom: null, aspect: 1 },
    { id: "accent", kind: "color", label: "Accent color", description: "Underline bar color", defaultText: null, defaultSrc: null, defaultColor: "#ff2d75", sourceFrom: null, aspect: null },
  ],
  shots: [
    {
      id: "shot-1",
      from: 0,
      durationInFrames: 75,
      description: "Kinetic headline on dark gradient",
      background: { kind: "linear", colors: ["#0b0b12", "#1d1030"], angle: 135 },
      transitionIn: { kind: "cut", durationInFrames: 0, easing: "linear" },
      camera: [{ prop: "scale", keys: [{ frame: 0, value: 1, easing: "linear", bezier: null }, { frame: 75, value: 1.06, easing: "linear", bezier: null }] }],
      layers: [headline, bar],
    },
    {
      id: "shot-2",
      from: 75,
      durationInFrames: 75,
      description: "Logo pop with tagline",
      background: { kind: "radial", colors: ["#2a1240", "#0b0b12"], angle: 0 },
      transitionIn: { kind: "wipeLeft", durationInFrames: 10, easing: "easeInOutCubic" },
      camera: [],
      layers: [logo, tagline],
    },
  ],
};
