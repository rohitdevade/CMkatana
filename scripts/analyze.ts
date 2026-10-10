/**
 * Usage:
 *   npm run analyze -- <video> [--refine N] [--concurrency N] [--dry]
 * --dry runs only the local CV stages (probe, cuts, frames, contact sheets) — no Claude calls.
 */
import fs from "node:fs";
import path from "node:path";
import { createJob, jobDir, promptPath, specPath, updateJob } from "../src/jobs/store";
import { buildContactSheets, sampleFrames } from "../src/pipeline/frames";
import { REF_NAME } from "../src/pipeline/mergeSpec";
import { probe } from "../src/pipeline/probe";
import { runAnalysis } from "../src/pipeline/runAnalysis";
import { detectShots } from "../src/pipeline/scenes";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const input = process.argv[2];
  if (!input || !fs.existsSync(input)) {
    console.error("usage: npm run analyze -- <video> [--refine N] [--concurrency N] [--dry]");
    process.exit(1);
  }
  const job = createJob(path.basename(input));
  const dir = jobDir(job.id);
  fs.copyFileSync(input, path.join(dir, REF_NAME));
  console.log(`job ${job.id} → ${dir}`);

  if (process.argv.includes("--dry")) {
    const refFile = path.join(dir, REF_NAME);
    const info = await probe(refFile);
    console.log(info);
    const shots = await detectShots(refFile, info.fps, info.durationInFrames);
    console.log(`${shots.length} shots:`, shots.map((s) => `${s.from}+${s.durationInFrames}`).join(" "));
    const sampled = await sampleFrames(refFile, path.join(dir, "frames"), info.fps);
    for (const s of shots) {
      const sheets = await buildContactSheets(sampled, s, path.join(dir, "sheets"));
      console.log(`shot ${s.index}: ${sheets.map((x) => path.basename(x.file)).join(", ")}`);
    }
    updateJob(job.id, { status: "error", phase: "dry run", error: "Dry run: contact sheets only, no Claude analysis yet. Use Retry analysis to run it." });
    return;
  }

  await runAnalysis(job.id, {
    refineIterations: Number(arg("--refine") ?? 1),
    concurrency: Number(arg("--concurrency") ?? 4),
  });
  console.log(`\nspec:          ${specPath(job.id)}`);
  console.log(`motion prompt: ${promptPath(job.id)}`);
  console.log(`render with:   npm run render -- ${job.id} [values.json]`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
