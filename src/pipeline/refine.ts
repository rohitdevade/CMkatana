import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { imageBlock, structuredCall, textBlock } from "../claude/client";
import { REFINE_SYSTEM } from "../claude/prompts/refine";
import { RefineResultSchema } from "../claude/schemas";
import { renderSpec } from "../render/render";
import { sanitizeShot } from "../spec/sanitize";
import type { MotionSpec, Shot } from "../spec/schema";
import { frameName, sampleFrames, type SampledFrames } from "./frames";
import { compareSsim, ssimByShot } from "./ssim";

export type ShotScore = { shotId: string; mean: number; worstFrame: number };
export type RefineReport = { iteration: number; mean: number; byShot: ShotScore[] }[];

export async function comparisonSheet(ref: SampledFrames, render: SampledFrames, shot: Shot, outFile: string, perFrame: number[]): Promise<string> {
  const inShot = ref.frames.filter((f) => f >= shot.from && f < shot.from + shot.durationInFrames && render.frames.includes(f));
  const max = 8;
  const picks = inShot.length <= max ? inShot : Array.from({ length: max }, (_, i) => inShot[Math.round((i * (inShot.length - 1)) / (max - 1))]);
  const tileW = 480;
  const meta = await sharp(path.join(ref.dir, frameName(picks[0]))).metadata();
  const tileH = Math.round((tileW * (meta.height ?? 360)) / (meta.width ?? 640));
  const gap = 6;
  const labelH = 32;
  const composites: OverlayOptions[] = [];
  for (let i = 0; i < picks.length; i++) {
    const f = picks[i];
    const top = gap + i * (tileH + labelH + gap);
    const label = (txt: string) =>
      Buffer.from(`<svg width="${tileW}" height="32" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000" fill-opacity="0.75"/><text x="8" y="23" font-family="Arial" font-size="19" font-weight="700" fill="#ffeb3b">${txt}</text></svg>`);
    composites.push({ input: await sharp(path.join(ref.dir, frameName(f))).resize(tileW, tileH).toBuffer(), left: gap, top: top + labelH });
    composites.push({ input: label(`ORIGINAL f${f - shot.from}`), left: gap, top });
    composites.push({ input: await sharp(path.join(render.dir, frameName(f))).resize(tileW, tileH).toBuffer(), left: gap * 2 + tileW, top: top + labelH });
    composites.push({ input: label(`RENDER f${f - shot.from}  ssim ${(perFrame[f] ?? 0).toFixed(3)}`), left: gap * 2 + tileW, top });
  }
  await sharp({ create: { width: tileW * 2 + gap * 3, height: picks.length * (tileH + labelH + gap) + gap, channels: 3, background: "#202020" } })
    .composite(composites)
    .jpeg({ quality: 82 })
    .toFile(outFile);
  return outFile;
}

/**
 * Render → compare → correct. Each iteration re-renders the spec with its default (original) assets,
 * scores every shot with SSIM against the reference, and sends the weakest shots back to Claude.
 */
export async function refineSpec(opts: {
  spec: MotionSpec;
  refFile: string;
  refSampled: SampledFrames;
  jobDir: string;
  iterations: number;
  /** Shots scoring at or above this are left alone. */
  targetSsim?: number;
  maxShotsPerIteration?: number;
  log: (msg: string) => void;
  onProgress?: (p: number) => void;
}): Promise<{ spec: MotionSpec; report: RefineReport }> {
  // Flat-background motion graphics score high even when misaligned (an 8% shift of every element still
  // scores ~0.97), so the bar is strict.
  const target = opts.targetSsim ?? 0.975;
  const maxShots = opts.maxShotsPerIteration ?? 4;
  let spec = opts.spec;
  const report: RefineReport = [];
  // A refinement pass can regress a shot; keep each shot's best-scoring version.
  const best = new Map<string, { shot: Shot; mean: number }>();
  const dir = path.join(opts.jobDir, "refine");
  fs.mkdirSync(dir, { recursive: true });

  for (let it = 0; it <= opts.iterations; it++) {
    const renderFile = path.join(dir, `iter${it}.mp4`);
    opts.log(`refine ${it}: rendering preview`);
    await renderSpec({ spec, values: {}, assetDir: opts.jobDir, outFile: renderFile, scale: 0.5, muted: true });
    const ssim = await compareSsim(opts.refFile, renderFile, path.join(dir, `iter${it}_ssim.log`));
    const byShot = ssimByShot(ssim.perFrame, spec.shots);
    report.push({ iteration: it, mean: ssim.mean, byShot });
    for (const score of byShot) {
      const prev = best.get(score.shotId);
      if (!prev || score.mean > prev.mean) best.set(score.shotId, { shot: spec.shots.find((s) => s.id === score.shotId)!, mean: score.mean });
    }
    opts.log(`refine ${it}: mean SSIM ${ssim.mean.toFixed(3)} (${byShot.map((s) => `${s.shotId}=${s.mean.toFixed(2)}`).join(", ")})`);
    opts.onProgress?.((it + 1) / (opts.iterations + 1));
    if (it === opts.iterations) break;

    const weak = [...byShot].filter((s) => s.mean < target).sort((a, b) => a.mean - b.mean).slice(0, maxShots);
    if (weak.length === 0) {
      opts.log(`refine ${it}: every shot ≥ ${target}, stopping`);
      break;
    }

    const renderSampled = await sampleFrames(renderFile, path.join(dir, `iter${it}_frames`), spec.fps);
    const updates = await Promise.allSettled(
      weak.map(async (score) => {
        const shot = spec.shots.find((s) => s.id === score.shotId)!;
        const sheet = await comparisonSheet(opts.refSampled, renderSampled, shot, path.join(dir, `iter${it}_${shot.id}.jpg`), ssim.perFrame);
        const result = await structuredCall({
          schema: RefineResultSchema,
          system: REFINE_SYSTEM,
          label: `refine ${shot.id}`,
          content: [
            textBlock(`Frame ${spec.width}x${spec.height} @ ${spec.fps} fps. Shot ${shot.id} (${shot.durationInFrames} frames). Mean SSIM ${score.mean.toFixed(3)}; worst at shot-relative f${score.worstFrame - shot.from}.`),
            textBlock("Left column ORIGINAL, right column RENDER:"),
            imageBlock(sheet),
            textBlock(`Current shot JSON:\n${JSON.stringify({ background: shot.background, transitionIn: shot.transitionIn, camera: shot.camera, layers: shot.layers })}`),
            textBlock(`Slots available: ${JSON.stringify(spec.slots.map((s) => ({ id: s.id, kind: s.kind, label: s.label })))}`),
          ],
        });
        opts.log(`refine ${it}: ${shot.id} — ${result.notes.slice(0, 200)}`);
        return sanitizeShot({ ...shot, background: result.background, transitionIn: result.transitionIn, camera: result.camera, layers: result.layers });
      }),
    );

    const replaced = new Map<string, Shot>();
    updates.forEach((u, i) => {
      if (u.status === "fulfilled") replaced.set(u.value.id, u.value);
      else opts.log(`refine ${it}: ${weak[i].shotId} failed — ${(u.reason as Error).message}`);
    });
    const slotIds = new Set(spec.slots.map((s) => s.id));
    spec = {
      ...spec,
      shots: spec.shots.map((s) => {
        const next = replaced.get(s.id);
        if (!next) return s;
        return { ...next, layers: next.layers.map((l) => (l.slotId && !slotIds.has(l.slotId) ? { ...l, slotId: null } : l)) };
      }),
    };
  }

  spec = { ...spec, shots: spec.shots.map((s) => best.get(s.id)?.shot ?? s) };
  return { spec, report };
}
