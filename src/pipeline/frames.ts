import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { ffmpeg } from "./ffmpeg";
import type { ShotRange } from "./scenes";

export type SampledFrames = { step: number; dir: string; frames: number[] };

/** Extracts every `step`-th frame at preview resolution. File name = absolute frame number. */
export async function sampleFrames(file: string, outDir: string, fps: number, width = 640): Promise<SampledFrames> {
  // ~12 samples per second is enough to recover keyframe timing to within a couple of frames.
  const step = Math.max(1, Math.round(fps / 12));
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, "tmp_%06d.jpg");
  await ffmpeg(["-i", file, "-an", "-vf", `select='not(mod(n\\,${step}))',scale=${width}:-2`, "-fps_mode", "passthrough", "-q:v", "3", tmp]);
  const outputs = fs.readdirSync(outDir).filter((f) => f.startsWith("tmp_")).sort();
  const frames: number[] = [];
  outputs.forEach((f, i) => {
    const n = i * step;
    fs.renameSync(path.join(outDir, f), path.join(outDir, frameName(n)));
    frames.push(n);
  });
  return { step, dir: outDir, frames };
}

export const frameName = (n: number) => `f_${String(n).padStart(6, "0")}.jpg`;

/** Extracts one full-resolution frame (accurate seek). */
export async function extractFrame(file: string, frame: number, fps: number, outFile: string): Promise<string> {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  // Seeking half a frame early still selects frame n (first pts >= t) but survives float rounding.
  // At the very end of a stream ffmpeg can exit 0 without writing anything, so step back if needed.
  for (let n = Math.max(0, Math.round(frame)); n >= Math.max(0, frame - 3); n--) {
    const t = Math.max(0, (n - 0.5) / fps);
    await ffmpeg(["-ss", t.toFixed(4), "-i", file, "-frames:v", "1", "-q:v", "2", outFile]);
    if (fs.existsSync(outFile)) return outFile;
  }
  throw new Error(`could not extract frame ${frame}`);
}

function pickEvenly<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return [...new Set(out)];
}

function labelSvg(text: string, w: number): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="34" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000" fill-opacity="0.75"/><text x="8" y="24" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#ffeb3b">${text}</text></svg>`,
  );
}

export type ContactSheet = { file: string; frames: number[] };

/**
 * Builds labeled contact sheets for one shot. Each tile is tagged with the shot-relative frame
 * (what Claude must use for keyframes) and the absolute frame.
 */
export async function buildContactSheets(
  sampled: SampledFrames,
  shot: ShotRange,
  outDir: string,
  { cols = 4, rows = 3, maxSheets = 3, tileWidth = 480 } = {},
): Promise<ContactSheet[]> {
  const inShot = sampled.frames.filter((f) => f >= shot.from && f < shot.from + shot.durationInFrames);
  const chosen = pickEvenly(inShot, cols * rows * maxSheets);
  if (chosen.length === 0) return [];

  const meta = await sharp(path.join(sampled.dir, frameName(chosen[0]))).metadata();
  const tileHeight = Math.round((tileWidth * (meta.height ?? 360)) / (meta.width ?? 640));
  const gap = 6;
  const labelH = 34; // label strip sits above each tile so it never hides content
  const perSheet = cols * rows;
  const sheets: ContactSheet[] = [];
  fs.mkdirSync(outDir, { recursive: true });

  for (let s = 0; s * perSheet < chosen.length; s++) {
    const batch = chosen.slice(s * perSheet, (s + 1) * perSheet);
    const usedRows = Math.ceil(batch.length / cols);
    const width = cols * tileWidth + (cols + 1) * gap;
    const height = usedRows * (tileHeight + labelH) + (usedRows + 1) * gap;
    const composites: OverlayOptions[] = [];
    for (let i = 0; i < batch.length; i++) {
      const left = gap + (i % cols) * (tileWidth + gap);
      const top = gap + Math.floor(i / cols) * (tileHeight + labelH + gap);
      const tile = await sharp(path.join(sampled.dir, frameName(batch[i]))).resize(tileWidth, tileHeight).toBuffer();
      composites.push({ input: tile, left, top: top + labelH });
      composites.push({ input: labelSvg(`f${batch[i] - shot.from}  (abs ${batch[i]})`, tileWidth), left, top });
    }
    const file = path.join(outDir, `shot${String(shot.index).padStart(3, "0")}_sheet${s}.jpg`);
    await sharp({ create: { width, height, channels: 3, background: "#202020" } })
      .composite(composites)
      .jpeg({ quality: 82 })
      .toFile(file);
    sheets.push({ file, frames: batch });
  }
  return sheets;
}
