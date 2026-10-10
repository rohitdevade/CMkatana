import React from "react";
import type { Shape } from "../../spec/schema";

type Props = { shape: Shape; colorOverride: string | null; boxW: number; boxH: number };

export const ShapeLayer: React.FC<Props> = ({ shape, colorOverride, boxW, boxH }) => {
  const fill = colorOverride ?? shape.fill ?? "transparent";
  const border = shape.stroke && shape.strokeWidth ? `${shape.strokeWidth}px solid ${shape.stroke}` : undefined;
  if (shape.kind === "line") {
    return <div style={{ width: "100%", height: "100%", background: colorOverride ?? shape.stroke ?? shape.fill ?? "#fff" }} />;
  }
  const radius = shape.kind === "ellipse" ? "50%" : `${(shape.radius ?? 0) * Math.min(boxW, boxH)}px`;
  return <div style={{ width: "100%", height: "100%", background: fill, border, borderRadius: radius, boxSizing: "border-box" }} />;
};
