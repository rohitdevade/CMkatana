import React from "react";
import { Img, OffthreadVideo, Sequence } from "remotion";
import type { Layer } from "../../spec/schema";

type Props = {
  layer: Layer;
  src: string;
  /** Original footage: start at this source frame. User footage starts at 0. */
  trimBefore: number;
  radiusPx: number;
  /**
   * For the original reference footage: draw the full frame offset so the layer box shows
   * exactly the region it covered in the source (instead of squeezing the whole frame in).
   */
  window?: { left: number; top: number; width: number; height: number } | null;
};

export const MediaLayer: React.FC<Props> = ({ layer, src, trimBefore, radiusPx, window }) => {
  const style: React.CSSProperties = window
    ? { position: "absolute", left: -window.left, top: -window.top, width: window.width, height: window.height }
    : { width: "100%", height: "100%", objectFit: layer.fit ?? "cover", display: "block" };
  const frameStyle: React.CSSProperties = { width: "100%", height: "100%", position: "relative", overflow: "hidden", borderRadius: radiusPx };

  if (layer.type === "video") {
    // Wrap in a Sequence so the clip's own timeline starts when the layer appears.
    return (
      <div style={frameStyle}>
        <Sequence from={layer.inFrame} layout="none" name={`${layer.name} clip`}>
          <OffthreadVideo src={src} trimBefore={Math.max(0, Math.round(trimBefore))} muted style={style} />
        </Sequence>
      </div>
    );
  }
  return (
    <div style={frameStyle}>
      <Img src={src} style={style} />
    </div>
  );
};
