import { ffmpeg } from "./ffmpeg";

export type ShotRange = { index: number; from: number; durationInFrames: number };

/**
 * Detects hard cuts with ffmpeg's scene score and returns contiguous shot ranges covering the video.
 * Motion graphics often have big in-shot changes, so the threshold is conservative and very short
 * shots are merged into their neighbour.
 */
export async function detectShots(
  file: string,
  fps: number,
  totalFrames: number,
  { threshold = 0.32, minShotFrames = Math.round(fps * 0.25), maxShotFrames = Math.round(fps * 6) } = {},
): Promise<ShotRange[]> {
  const { stderr } = await ffmpeg(["-i", file, "-an", "-vf", `select='gt(scene,${threshold})',showinfo`, "-f", "null", "-"]);
  const cutFrames = [...stderr.matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Math.round(Number(m[1]) * fps))
    .filter((f) => f > 0 && f < totalFrames)
    .sort((a, b) => a - b);

  return buildShots(cutFrames, totalFrames, minShotFrames, maxShotFrames);
}

export function buildShots(cutFrames: number[], totalFrames: number, minShotFrames: number, maxShotFrames = Infinity): ShotRange[] {
  const bounds = [0];
  for (const c of cutFrames) {
    if (c - bounds[bounds.length - 1] >= minShotFrames) bounds.push(c);
  }
  // A too-short tail is merged into the previous shot.
  if (bounds.length > 1 && totalFrames - bounds[bounds.length - 1] < minShotFrames) bounds.pop();
  bounds.push(totalFrames);
  const shots: ShotRange[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    // Long shots (soft transitions are not detected as cuts) are split into even segments so each
    // analysis call still sees densely sampled frames. Each segment is rebuilt independently.
    const len = bounds[i + 1] - bounds[i];
    const parts = Math.max(1, Math.ceil(len / maxShotFrames));
    for (let p = 0; p < parts; p++) {
      const from = bounds[i] + Math.round((p * len) / parts);
      const to = bounds[i] + Math.round(((p + 1) * len) / parts);
      shots.push({ index: shots.length, from, durationInFrames: to - from });
    }
  }
  return shots;
}
