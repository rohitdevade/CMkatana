import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { extractFrame } from "./frames";

export type NormBox = { x: number; y: number; width: number; height: number };

/**
 * Crops a slot's default asset out of the reference video (normalized center-based box).
 * Returns the path relative to `jobDir`.
 */
export async function cropFromReference(opts: {
  refFile: string;
  jobDir: string;
  fps: number;
  frame: number;
  box: NormBox;
  name: string;
}): Promise<string> {
  const fullDir = path.join(opts.jobDir, "full");
  const full = path.join(fullDir, `full_${opts.frame}.jpg`);
  if (!fs.existsSync(full)) await extractFrame(opts.refFile, opts.frame, opts.fps, full);

  const img = sharp(full);
  const { width = 0, height = 0 } = await img.metadata();
  const w = Math.max(2, Math.round(opts.box.width * width));
  const h = Math.max(2, Math.round(opts.box.height * height));
  const left = Math.min(Math.max(0, Math.round(opts.box.x * width - w / 2)), Math.max(0, width - w));
  const top = Math.min(Math.max(0, Math.round(opts.box.y * height - h / 2)), Math.max(0, height - h));

  const rel = path.join("crops", `${opts.name}.png`);
  fs.mkdirSync(path.join(opts.jobDir, "crops"), { recursive: true });
  await sharp(full)
    .extract({ left, top, width: Math.min(w, width - left), height: Math.min(h, height - top) })
    .png()
    .toFile(path.join(opts.jobDir, rel));
  return rel.replace(/\\/g, "/");
}
