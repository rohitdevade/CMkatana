import fs from "node:fs";
import { ffmpeg } from "./ffmpeg";

export type SsimReport = { mean: number; perFrame: number[] };

/** Per-frame SSIM (luma+chroma "All") between a render and the reference, at the reference's size. */
export async function compareSsim(refFile: string, renderFile: string, statsFile: string): Promise<SsimReport> {
  const escaped = statsFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  await ffmpeg([
    "-i", renderFile,
    "-i", refFile,
    "-lavfi", `[0:v][1:v]scale2ref=flags=bicubic[a][b];[a][b]ssim=stats_file='${escaped}'`,
    "-f", "null", "-",
  ]);
  const perFrame = fs
    .readFileSync(statsFile, "utf8")
    .split(/\r?\n/)
    .map((line) => /All:([\d.]+)/.exec(line))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => Number(m[1]));
  const mean = perFrame.length ? perFrame.reduce((a, b) => a + b, 0) / perFrame.length : 0;
  return { mean, perFrame };
}

/** Mean SSIM per shot, given per-frame scores aligned to frame 0. */
export function ssimByShot(perFrame: number[], shots: { id: string; from: number; durationInFrames: number }[]) {
  return shots.map((s) => {
    const slice = perFrame.slice(s.from, s.from + s.durationInFrames);
    const mean = slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    let worst = s.from;
    slice.forEach((v, i) => {
      if (v < perFrame[worst]) worst = s.from + i;
    });
    return { shotId: s.id, mean, worstFrame: worst };
  });
}
