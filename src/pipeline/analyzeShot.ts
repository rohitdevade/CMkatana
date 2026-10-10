import path from "node:path";
import { imageBlock, structuredCall, textBlock } from "../claude/client";
import { SHOT_ANALYSIS_SYSTEM, shotAnalysisUser } from "../claude/prompts/shotAnalysis";
import { ShotAnalysisSchema, type ShotAnalysis } from "../claude/schemas";
import { buildContactSheets, extractFrame, type SampledFrames } from "./frames";
import type { VideoInfo } from "./probe";
import type { ShotRange } from "./scenes";

export async function analyzeShot(opts: {
  refFile: string;
  jobDir: string;
  info: VideoInfo;
  sampled: SampledFrames;
  shot: ShotRange;
  shotCount: number;
}): Promise<ShotAnalysis> {
  const { shot, info } = opts;
  const sheets = await buildContactSheets(opts.sampled, shot, path.join(opts.jobDir, "sheets"));

  // Two sharp stills: mid-shot (usually everything on screen) and the last frame (settled state).
  const stillFrames = [...new Set([shot.from + Math.floor(shot.durationInFrames / 2), shot.from + shot.durationInFrames - 1])];
  const stills = await Promise.all(
    stillFrames.map((f) => extractFrame(opts.refFile, f, info.fps, path.join(opts.jobDir, "full", `full_${f}.jpg`))),
  );

  const content = [
    textBlock(
      shotAnalysisUser({
        shotIndex: shot.index,
        shotCount: opts.shotCount,
        from: shot.from,
        durationInFrames: shot.durationInFrames,
        fps: info.fps,
        width: info.width,
        height: info.height,
        sampleStep: opts.sampled.step,
      }),
    ),
    ...sheets.flatMap((s, i) => [textBlock(`Contact sheet ${i + 1}/${sheets.length}`), imageBlock(s.file)]),
    ...stills.flatMap((file, i) => [textBlock(`Full-resolution still at shot-relative frame f${stillFrames[i] - shot.from}`), imageBlock(file)]),
  ];

  return structuredCall({ schema: ShotAnalysisSchema, system: SHOT_ANALYSIS_SYSTEM, content, label: `shot ${shot.index}` });
}
