import fs from "node:fs";
import path from "node:path";
import { jobDir, logJob, promptPath, updateJob, writeSpec } from "../jobs/store";
import { analyzeShot } from "./analyzeShot";
import { sampleFrames } from "./frames";
import { mergeSpec, REF_NAME } from "./mergeSpec";
import { probe } from "./probe";
import { refineSpec } from "./refine";
import { detectShots } from "./scenes";

export type AnalysisOptions = {
  /** Render-compare-correct passes (0 disables). */
  refineIterations?: number;
  /** Parallel Claude calls for shot analysis. */
  concurrency?: number;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

/** Full pipeline: probe → cuts → frames → per-shot Claude → merge → (refine) → spec.json + motion-prompt.md */
export async function runAnalysis(jobId: string, opts: AnalysisOptions = {}): Promise<void> {
  const dir = jobDir(jobId);
  const refFile = path.join(dir, REF_NAME);
  const log = (msg: string) => logJob(jobId, msg);
  const phase = (name: string, progress = 0) => updateJob(jobId, { phase: name, progress });

  try {
    updateJob(jobId, { status: "analyzing", error: null });
    phase("probing");
    const info = await probe(refFile);
    log(`video ${info.width}x${info.height} @ ${info.fps} fps, ${info.durationInFrames} frames, audio=${info.hasAudio}`);

    phase("detecting cuts", 0.05);
    const shots = await detectShots(refFile, info.fps, info.durationInFrames);
    log(`detected ${shots.length} shot(s) at frames ${shots.map((s) => s.from).join(", ")}`);

    phase("sampling frames", 0.1);
    const sampled = await sampleFrames(refFile, path.join(dir, "frames"), info.fps);
    log(`sampled ${sampled.frames.length} frames (every ${sampled.step})`);

    phase("analyzing shots with Claude", 0.15);
    let done = 0;
    const analyses = await mapLimit(shots, opts.concurrency ?? 4, async (shot) => {
      const a = await analyzeShot({ refFile, jobDir: dir, info, sampled, shot, shotCount: shots.length });
      done++;
      log(`shot ${shot.index + 1}/${shots.length}: ${a.layers.length} layers, ${a.slotCandidates.length} slot candidates — ${a.description.slice(0, 120)}`);
      updateJob(jobId, { progress: 0.15 + 0.55 * (done / shots.length) });
      return a;
    });
    fs.writeFileSync(path.join(dir, "shot-analyses.json"), JSON.stringify(analyses, null, 2));

    phase("merging slots + writing motion prompt", 0.72);
    let { spec, motionPrompt } = await mergeSpec({ jobDir: dir, refFile, info, sampled, shots, analyses, log });
    writeSpec(jobId, spec);
    fs.writeFileSync(promptPath(jobId), motionPrompt);
    log(`spec ready: ${spec.slots.length} replaceable slot(s): ${spec.slots.map((s) => s.label).join(", ")}`);

    let ssim: { mean: number; byShot: { shotId: string; mean: number }[] } | null = null;
    const iterations = opts.refineIterations ?? 1;
    if (iterations > 0) {
      phase("refining against the original", 0.8);
      const refined = await refineSpec({
        spec,
        refFile,
        refSampled: sampled,
        jobDir: dir,
        iterations,
        log,
        onProgress: (p) => updateJob(jobId, { progress: 0.8 + 0.2 * p }),
      });
      spec = refined.spec;
      writeSpec(jobId, spec);
      fs.writeFileSync(path.join(dir, "refine-report.json"), JSON.stringify(refined.report, null, 2));
      const last = refined.report[refined.report.length - 1];
      ssim = { mean: last.mean, byShot: last.byShot.map(({ shotId, mean }) => ({ shotId, mean })) };
    }

    updateJob(jobId, { status: "ready", phase: "ready", progress: 1, hasSpec: true, ssim });
    log("analysis complete");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`ERROR: ${msg}`);
    updateJob(jobId, { status: "error", error: msg });
    throw err;
  }
}
