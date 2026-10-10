import React, { useMemo } from "react";
import { fitText } from "@remotion/layout-utils";
import { easingFn } from "../../spec/easing";
import type { Layer, TextAnim } from "../../spec/schema";

type Props = {
  layer: Layer;
  text: string;
  /** The text the layer was analyzed with; used to decide whether to shrink-to-fit. */
  originalText: string;
  colorOverride: string | null;
  frame: number;
  width: number;
  height: number;
  boxWidth: number;
};

function splitUnits(text: string, unit: TextAnim["unit"]): string[] {
  if (unit === "char") return Array.from(text);
  if (unit === "line") return text.split("\n");
  // Keep the whitespace attached so spacing survives inline-block layout.
  return text.split(/(\s+)/).filter((s) => s.length > 0);
}

function unitStyle(anim: TextAnim, index: number, frame: number, width: number, height: number): React.CSSProperties {
  const start = anim.startFrame + index * anim.staggerFrames;
  const raw = anim.durationFrames <= 0 ? 1 : (frame - start) / anim.durationFrames;
  const t = easingFn(anim.easing)(Math.min(1, Math.max(0, raw)));
  const k = 1 - t;
  const f = anim.from;
  return {
    display: "inline-block",
    whiteSpace: "pre",
    opacity: f.opacity + (1 - f.opacity) * t,
    transform: `translate(${f.offsetX * width * k}px, ${f.offsetY * height * k}px) scale(${f.scale + (1 - f.scale) * t}) rotate(${f.rotation * k}deg)`,
    filter: f.blur > 0 && k > 0 ? `blur(${f.blur * k}px)` : undefined,
  };
}

export const TextLayer: React.FC<Props> = ({ layer, text, originalText, colorOverride, frame, width, height, boxWidth }) => {
  const style = layer.style;
  const family = style?.fontFamily ?? "Inter";
  const weight = style?.fontWeight ?? 700;
  const specSize = (style?.fontSize ?? 0.08) * height;
  const multiline = text.includes("\n") || originalText.includes("\n");

  // Replacement text that is longer than the original shrinks to stay inside the analyzed box.
  const fontSize = useMemo(() => {
    if (multiline || text.length <= originalText.length || boxWidth <= 0) return specSize;
    try {
      const fitted = fitText({
        text,
        withinWidth: boxWidth,
        fontFamily: family,
        fontWeight: weight,
        letterSpacing: `${style?.letterSpacing ?? 0}em`,
        textTransform: style?.textTransform === "none" ? undefined : style?.textTransform,
        validateFontIsLoaded: false,
      }).fontSize;
      return Math.min(specSize, fitted);
    } catch {
      return specSize;
    }
  }, [multiline, text, originalText.length, boxWidth, specSize, family, weight, style?.letterSpacing, style?.textTransform]);

  const css: React.CSSProperties = {
    fontFamily: `"${family}", Inter, Arial, sans-serif`,
    fontWeight: weight,
    fontStyle: style?.italic ? "italic" : "normal",
    fontSize,
    color: colorOverride ?? style?.color ?? "#ffffff",
    letterSpacing: `${style?.letterSpacing ?? 0}em`,
    lineHeight: style?.lineHeight ?? 1.1,
    textAlign: style?.align ?? "center",
    textTransform: style?.textTransform ?? "none",
    whiteSpace: multiline ? "pre-wrap" : "nowrap",
    WebkitTextStroke: style?.strokeColor && style.strokeWidth ? `${style.strokeWidth}px ${style.strokeColor}` : undefined,
    width: "100%",
  };

  const anim = layer.textAnim;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: style?.align === "left" ? "flex-start" : style?.align === "right" ? "flex-end" : "center" }}>
      <div style={css}>
        {anim
          ? splitUnits(text, anim.unit).map((u, i) => (
              <React.Fragment key={i}>
                <span style={unitStyle(anim, i, frame, width, height)}>{u}</span>
                {anim.unit === "line" ? <br /> : null}
              </React.Fragment>
            ))
          : text}
      </div>
    </div>
  );
};
