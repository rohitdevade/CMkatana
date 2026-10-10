import React from "react";
import { resolveLayer } from "../../spec/interpolate";
import type { Layer, MotionSpec, SlotValues } from "../../spec/schema";
import { resolveSlot } from "../../spec/slots";
import { MediaLayer } from "./MediaLayer";
import { ShapeLayer } from "./ShapeLayer";
import { TextLayer } from "./TextLayer";

type Props = {
  spec: MotionSpec;
  values: SlotValues;
  assetBase: string;
  layer: Layer;
  shotFrom: number;
  /** Shot-relative frame. */
  frame: number;
  debug?: boolean;
};

const BLEND: Record<string, React.CSSProperties["mixBlendMode"]> = {
  normal: "normal",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  add: "plus-lighter",
};

export const LayerView: React.FC<Props> = ({ spec, values, assetBase, layer, shotFrom, frame, debug }) => {
  if (frame < layer.inFrame || frame >= layer.outFrame) return null;

  const W = spec.width;
  const H = spec.height;
  const t = resolveLayer(layer, frame);
  if (t.opacity <= 0.001 && !debug) return null;

  const boxW = t.width * W;
  const boxH = t.height * H;
  const slot = resolveSlot(spec, values, layer.slotId, assetBase);
  const radiusPx = (layer.borderRadius ?? 0) * Math.min(boxW, boxH);

  const clip =
    t.clipTop || t.clipRight || t.clipBottom || t.clipLeft
      ? `inset(${t.clipTop * 100}% ${t.clipRight * 100}% ${t.clipBottom * 100}% ${t.clipLeft * 100}%)`
      : undefined;

  const container: React.CSSProperties = {
    position: "absolute",
    left: t.x * W,
    top: t.y * H,
    width: boxW,
    height: boxH,
    transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale * t.scaleX}, ${t.scale * t.scaleY})`,
    opacity: t.opacity,
    filter: t.blur > 0 ? `blur(${t.blur}px)` : undefined,
    clipPath: clip,
    zIndex: Math.round(layer.z),
    mixBlendMode: layer.blendMode ? BLEND[layer.blendMode] : undefined,
    outline: debug && layer.slotId ? "3px dashed #ff2d75" : undefined,
  };

  let content: React.ReactNode = null;
  if (layer.type === "text") {
    const text = slot.text ?? layer.text ?? "";
    const originalText = slot.slot?.defaultText ?? layer.text ?? text;
    content = (
      <TextLayer
        layer={layer}
        text={text}
        originalText={originalText}
        colorOverride={slot.slot?.kind === "color" ? slot.color : null}
        frame={frame}
        width={W}
        height={H}
        boxWidth={boxW}
      />
    );
  } else if (layer.type === "shape" && layer.shape) {
    content = <ShapeLayer shape={layer.shape} colorOverride={slot.slot?.kind === "color" ? slot.color : null} boxW={boxW} boxH={boxH} />;
  } else if ((layer.type === "image" || layer.type === "video") && slot.src) {
    // Original footage keeps its source timing; a user clip starts from its first frame.
    const trimBefore = slot.isDefaultFootage ? (slot.slot?.sourceFrom ?? shotFrom + layer.inFrame) : 0;
    const window = slot.isDefaultFootage ? { left: t.x * W - boxW / 2, top: t.y * H - boxH / 2, width: W, height: H } : null;
    content = <MediaLayer layer={layer} src={slot.src} trimBefore={trimBefore} radiusPx={radiusPx} window={window} />;
  } else if (debug) {
    content = <div style={{ width: "100%", height: "100%", background: "rgba(255,45,117,0.25)" }} />;
  }

  return (
    <div style={container}>
      {content}
      {debug && layer.slotId ? (
        <div style={{ position: "absolute", top: -28, left: 0, background: "#ff2d75", color: "#fff", font: "600 18px Inter, sans-serif", padding: "2px 8px", whiteSpace: "nowrap" }}>
          {slot.slot?.label ?? layer.slotId}
        </div>
      ) : null}
    </div>
  );
};
