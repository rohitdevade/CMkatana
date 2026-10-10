import React from "react";
import { Composition } from "remotion";
import type { SpecVideoProps } from "../spec/schema";
import { sampleSpec } from "./sampleSpec";
import { SpecVideo } from "./SpecVideo";

export const COMPOSITION_ID = "SpecVideo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={SpecVideo as React.FC<Record<string, unknown>>}
    defaultProps={{ spec: sampleSpec, values: {}, assetBase: "", debug: false } satisfies SpecVideoProps}
    // Size, fps and length always come from the spec being rendered.
    calculateMetadata={({ props }) => {
      const { spec } = props as unknown as SpecVideoProps;
      return { width: spec.width, height: spec.height, fps: spec.fps, durationInFrames: Math.max(1, Math.round(spec.durationInFrames)) };
    }}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={150}
  />
);
