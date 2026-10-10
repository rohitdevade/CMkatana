import React from "react";
import { AbsoluteFill, Audio, Sequence, useCurrentFrame } from "remotion";
import { resolveTransform } from "../spec/interpolate";
import type { Background, Shot, SpecVideoProps } from "../spec/schema";
import { toUrl } from "../spec/slots";
import { useGoogleFonts } from "./fonts";
import { LayerView } from "./layers/LayerView";
import { transitionStyle } from "./transitions";

function backgroundCss(bg: Background): string {
  const c = bg.colors.length ? bg.colors : ["#000000"];
  switch (bg.kind) {
    case "transparent":
      return "transparent";
    case "linear":
      return c.length > 1 ? `linear-gradient(${bg.angle}deg, ${c.join(", ")})` : c[0];
    case "radial":
      return c.length > 1 ? `radial-gradient(circle at center, ${c.join(", ")})` : c[0];
    default:
      return c[0];
  }
}

const ShotView: React.FC<SpecVideoProps & { shot: Shot }> = ({ shot, spec, values, assetBase, debug }) => {
  const frame = useCurrentFrame(); // shot-relative (inside <Sequence>)
  const cam = resolveTransform({ x: 0, y: 0, width: 1, height: 1 }, shot.camera, frame);
  const layers = [...shot.layers].sort((a, b) => a.z - b.z);
  return (
    <AbsoluteFill style={{ background: backgroundCss(shot.background), overflow: "hidden", ...transitionStyle(shot.transitionIn, frame) }}>
      <AbsoluteFill
        style={{
          transform: `translate(${cam.x * spec.width}px, ${cam.y * spec.height}px) rotate(${cam.rotation}deg) scale(${cam.scale * cam.scaleX}, ${cam.scale * cam.scaleY})`,
          filter: cam.blur > 0 ? `blur(${cam.blur}px)` : undefined,
          opacity: cam.opacity,
        }}
      >
        {layers.map((layer) => (
          <LayerView key={layer.id} spec={spec} values={values} assetBase={assetBase} layer={layer} shotFrom={shot.from} frame={frame} debug={debug} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Generic interpreter: renders any MotionSpec with the user's slot values swapped in. */
export const SpecVideo: React.FC<SpecVideoProps> = (props) => {
  const { spec, assetBase } = props;
  const families = new Set(spec.fonts);
  for (const s of spec.shots) for (const l of s.layers) if (l.style?.fontFamily) families.add(l.style.fontFamily);
  useGoogleFonts([...families]);

  const shots = [...spec.shots].sort((a, b) => a.from - b.from);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {shots.map((shot, i) => {
        // Keep the outgoing shot alive underneath the next shot's transition-in.
        const next = shots[i + 1];
        const overlap = next && next.transitionIn.kind !== "cut" ? Math.max(0, Math.round(next.transitionIn.durationInFrames)) : 0;
        const duration = Math.max(1, Math.round(shot.durationInFrames) + overlap);
        return (
          <Sequence key={shot.id} from={Math.round(shot.from)} durationInFrames={duration} name={`${shot.id}: ${shot.description.slice(0, 40)}`}>
            <ShotView {...props} shot={shot} />
          </Sequence>
        );
      })}
      {spec.audio?.keep ? <Audio src={toUrl(spec.audio.src, assetBase)} /> : null}
    </AbsoluteFill>
  );
};
