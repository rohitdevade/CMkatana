import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { imageBlock, structuredCall, textBlock } from "../claude/client";
import { MERGE_SYSTEM } from "../claude/prompts/merge";
import { MergeResultSchema, type MergeResult, type ShotAnalysis, type SlotCandidate } from "../claude/schemas";
import { sanitizeSpec } from "../spec/sanitize";
import { MotionSpecSchema, type MotionSpec, type Shot, type Slot } from "../spec/schema";
import { cropFromReference } from "./crops";
import { frameName, type SampledFrames } from "./frames";
import type { VideoInfo } from "./probe";
import type { ShotRange } from "./scenes";

export const REF_NAME = "ref.mp4";
export const shotId = (i: number) => `shot-${i + 1}`;

async function thumbnailStrip(sampled: SampledFrames, shots: ShotRange[], outFile: string): Promise<string> {
  const cols = Math.min(6, shots.length);
  const tileW = 320;
  const meta = await sharp(path.join(sampled.dir, frameName(sampled.frames[0]))).metadata();
  const tileH = Math.round((tileW * (meta.height ?? 360)) / (meta.width ?? 640));
  const picks = shots.slice(0, 36).map((s) => {
    const mid = s.from + s.durationInFrames / 2;
    return sampled.frames.reduce((best, f) => (Math.abs(f - mid) < Math.abs(best - mid) ? f : best), sampled.frames[0]);
  });
  const rows = Math.ceil(picks.length / cols);
  const composites: OverlayOptions[] = [];
  for (let i = 0; i < picks.length; i++) {
    const left = (i % cols) * tileW;
    const top = Math.floor(i / cols) * tileH;
    composites.push({ input: await sharp(path.join(sampled.dir, frameName(picks[i]))).resize(tileW, tileH).toBuffer(), left, top });
    composites.push({
      input: Buffer.from(`<svg width="120" height="30" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#000" fill-opacity="0.75"/><text x="6" y="21" font-family="Arial" font-size="18" font-weight="700" fill="#ffeb3b">${shotId(i)}</text></svg>`),
      left,
      top,
    });
  }
  await sharp({ create: { width: cols * tileW, height: rows * tileH, channels: 3, background: "#000" } }).composite(composites).jpeg({ quality: 80 }).toFile(outFile);
  return outFile;
}

function compactBreakdown(analyses: ShotAnalysis[], shots: ShotRange[], fps: number) {
  return analyses.map((a, i) => ({
    shotId: shotId(i),
    startSec: +(shots[i].from / fps).toFixed(2),
    durationFrames: shots[i].durationInFrames,
    description: a.description,
    transitionIn: a.transitionIn,
    background: a.background,
    layers: a.layers.map((l) => ({
      id: l.id,
      type: l.type,
      name: l.name,
      slotId: l.slotId,
      text: l.text,
      font: l.style ? `${l.style.fontFamily} ${l.style.fontWeight}` : undefined,
      fontSize: l.style?.fontSize,
      color: l.style?.color ?? l.shape?.fill ?? undefined,
      base: l.base,
      inFrame: l.inFrame,
      outFrame: l.outFrame,
      tracks: l.tracks,
      textAnim: l.textAnim,
    })),
    slotCandidates: a.slotCandidates.map((c) => ({ id: c.id, kind: c.kind, label: c.label, text: c.text, color: c.color })),
  }));
}

export async function mergeSpec(opts: {
  jobDir: string;
  refFile: string;
  info: VideoInfo;
  sampled: SampledFrames;
  shots: ShotRange[];
  analyses: ShotAnalysis[];
  log?: (msg: string) => void;
}): Promise<{ spec: MotionSpec; motionPrompt: string; merge: MergeResult }> {
  const { info, shots, analyses } = opts;
  const strip = await thumbnailStrip(opts.sampled, shots, path.join(opts.jobDir, "sheets", "strip.jpg"));

  const merge = await structuredCall({
    schema: MergeResultSchema,
    system: MERGE_SYSTEM,
    label: "merge",
    content: [
      textBlock(`Video: ${info.width}x${info.height} @ ${info.fps} fps, ${info.durationInFrames} frames (${info.durationSec.toFixed(2)} s), ${shots.length} shots.`),
      textBlock("Thumbnail strip (one mid-shot frame per shot):"),
      imageBlock(strip),
      textBlock(`Per-shot breakdown (JSON):\n${JSON.stringify(compactBreakdown(analyses, shots, info.fps))}`),
    ],
  });

  // (shotId, candidateId) → global slot id
  const memberOf = new Map<string, string>();
  for (const s of merge.slots) for (const m of s.members) memberOf.set(`${m.shotId}|${m.candidateId}`, s.id);

  const fontMap = new Map(merge.fontMap.map((f) => [f.from.toLowerCase(), f.to]));
  const firstCandidate = new Map<string, { shotIndex: number; cand: SlotCandidate }>();
  const slotMeta = new Map(merge.slots.map((s) => [s.id, s]));
  const extraSlots: Slot[] = [];
  const usedIds = new Set(merge.slots.map((s) => s.id));

  const specShots: Shot[] = analyses.map((a, i) => {
    const sid = shotId(i);
    const localToGlobal = new Map<string, string>();
    for (const c of a.slotCandidates) {
      let gid = memberOf.get(`${sid}|${c.id}`);
      if (!gid) {
        // Candidate the merge pass did not assign: keep it as its own slot.
        gid = c.id;
        let n = 2;
        while (usedIds.has(gid)) gid = `${c.id}_${n++}`;
        usedIds.add(gid);
        extraSlots.push({ id: gid, kind: c.kind, label: c.label, description: c.description, defaultText: null, defaultSrc: null, defaultColor: null, sourceFrom: null, aspect: null });
      }
      localToGlobal.set(c.id, gid);
      if (!firstCandidate.has(gid)) firstCandidate.set(gid, { shotIndex: i, cand: c });
    }
    return {
      id: sid,
      from: shots[i].from,
      durationInFrames: shots[i].durationInFrames,
      description: a.description,
      background: a.background,
      transitionIn: i === 0 ? { kind: "cut", durationInFrames: 0, easing: "linear" } : a.transitionIn,
      camera: a.camera,
      layers: a.layers.map((l) => ({
        ...l,
        slotId: l.slotId ? (localToGlobal.get(l.slotId) ?? null) : null,
        style: l.style ? { ...l.style, fontFamily: fontMap.get(l.style.fontFamily.toLowerCase()) ?? l.style.fontFamily } : null,
      })),
    };
  });

  const slots: Slot[] = [];
  for (const s of [...merge.slots.map((m): Slot => ({ id: m.id, kind: m.kind, label: m.label, description: m.description, defaultText: null, defaultSrc: null, defaultColor: null, sourceFrom: null, aspect: null })), ...extraSlots]) {
    const first = firstCandidate.get(s.id);
    if (!first) continue; // merge listed a slot with no valid members
    const { cand, shotIndex } = first;
    const meta = slotMeta.get(s.id);
    const slot: Slot = { ...s, kind: meta?.kind ?? s.kind };
    if (slot.kind === "text") {
      const layer = specShots[shotIndex].layers.find((l) => l.slotId === s.id && l.type === "text");
      slot.defaultText = cand.text ?? layer?.text ?? "";
    } else if (slot.kind === "color") {
      slot.defaultColor = cand.color ?? "#ffffff";
    } else if (slot.kind === "video") {
      slot.defaultSrc = REF_NAME; // original footage, re-timed per layer
      slot.aspect = (cand.box.width * info.width) / Math.max(1, cand.box.height * info.height);
    } else {
      try {
        slot.defaultSrc = await cropFromReference({
          refFile: opts.refFile,
          jobDir: opts.jobDir,
          fps: info.fps,
          frame: shots[shotIndex].from + Math.round(cand.frame),
          box: cand.box,
          name: s.id,
        });
      } catch (err) {
        opts.log?.(`crop for slot ${s.id} failed: ${(err as Error).message}`);
      }
      slot.aspect = (cand.box.width * info.width) / Math.max(1, cand.box.height * info.height);
    }
    slots.push(slot);
  }

  const fonts = [...new Set([...merge.fonts, ...specShots.flatMap((s) => s.layers.map((l) => l.style?.fontFamily).filter((f): f is string => Boolean(f)))])];

  const spec = sanitizeSpec(
    MotionSpecSchema.parse({
      version: 1,
      title: merge.title,
      fps: info.fps,
      width: info.width,
      height: info.height,
      durationInFrames: info.durationInFrames,
      fonts,
      palette: merge.palette,
      audio: info.hasAudio ? { src: REF_NAME, keep: true } : null,
      slots,
      shots: specShots,
    }),
  );

  return { spec, motionPrompt: merge.motionPrompt, merge };
}
