/**
 * Claude Code skill pipeline: the same analysis as `npm run analyze`, but the vision work is done by the
 * Claude Code session running the skill (subscription), not by API calls. Every command here is local.
 *
 *   npm run skill -- prepare <video>     probe, cuts, frames, contact sheets → job + per-shot task files
 *   npm run skill -- breakdown <jobId>   validate skill/shots/shot-N.json → merge task (breakdown + brief)
 *   npm run skill -- assemble <jobId>    validate skill/merge.json + motion-prompt.md → spec.json (job ready)
 *   npm run skill -- refine <jobId>      apply pending fixes, render + SSIM vs original, write fix tasks for weak shots [--target 0.975]
 *   npm run skill -- finish <jobId>      keep each shot's best-scoring version, record the score
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { MERGE_SYSTEM } from "../src/claude/prompts/merge";
import { REFINE_SYSTEM } from "../src/claude/prompts/refine";
import { SHOT_ANALYSIS_SYSTEM, shotAnalysisUser } from "../src/claude/prompts/shotAnalysis";
import { MergeResultSchema, RefineResultSchema, ShotAnalysisSchema, type ShotAnalysis } from "../src/claude/schemas";
import { createJob, getJob, jobDir, promptPath, readSpec, updateJob, writeFileDurable, writeSpec } from "../src/jobs/store";
import { buildContactSheets, extractFrame, sampleFrames, type SampledFrames } from "../src/pipeline/frames";
import { assembleSpec, compactBreakdown, REF_NAME, shotId, thumbnailStrip } from "../src/pipeline/mergeSpec";
import { probe, type VideoInfo } from "../src/pipeline/probe";
import { comparisonSheet } from "../src/pipeline/refine";
import { detectShots, type ShotRange } from "../src/pipeline/scenes";
import { compareSsim, ssimByShot } from "../src/pipeline/ssim";
import { renderSpec } from "../src/render/render";
import { sanitizeShot } from "../src/spec/sanitize";
import type { Shot } from "../src/spec/schema";

type Manifest = {
  info: VideoInfo;
  sampled: SampledFrames;
  shots: (ShotRange & { id: string; sheets: string[]; stills: { file: string; frame: number }[] })[];
  strip: string;
};

const targetArg = process.argv.indexOf("--target");
const TARGET_SSIM = targetArg > -1 ? Number(process.argv[targetArg + 1]) : 0.975;
const MAX_FIXES_PER_PASS = 4;
const MergeOutputSchema = MergeResultSchema.omit({ motionPrompt: true });

const skillDir = (jobId: string) => path.join(jobDir(jobId), "skill");
const readJson = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const writeJson = (file: string, v: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeFileDurable(file, JSON.stringify(v, null, 2));
};
const schemaFile = (dir: string, name: string, schema: z.ZodType) => {
  const file = path.join(dir, `${name}.schema.json`);
  writeJson(file, z.toJSONSchema(schema, { io: "input" }));
  return file;
};
const loadManifest = (jobId: string) => readJson<Manifest>(path.join(skillDir(jobId), "manifest.json"));

/** Validates a JSON file against a schema; returns the parsed value or a readable error list. */
function validate<S extends z.ZodType>(file: string, schema: S): { ok: true; value: z.infer<S> } | { ok: false; error: string } {
  if (!fs.existsSync(file)) return { ok: false, error: "missing" };
  let raw: unknown;
  try {
    raw = readJson(file);
  } catch (err) {
    return { ok: false, error: `invalid JSON: ${(err as Error).message}` };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data };
  const issues = parsed.error.issues.slice(0, 15).map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`);
  return { ok: false, error: `schema errors:\n${issues.join("\n")}${parsed.error.issues.length > 15 ? `\n  … ${parsed.error.issues.length - 15} more` : ""}` };
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function prepare(input: string) {
  if (!input || !fs.existsSync(input)) fail("usage: npm run skill -- prepare <video>");
  const job = createJob(path.basename(input));
  const dir = jobDir(job.id);
  const sdir = skillDir(job.id);
  const refFile = path.join(dir, REF_NAME);
  fs.copyFileSync(input, refFile);
  updateJob(job.id, { status: "analyzing", phase: "preparing frames" });

  const info = await probe(refFile);
  const ranges = await detectShots(refFile, info.fps, info.durationInFrames);
  const sampled = await sampleFrames(refFile, path.join(dir, "frames"), info.fps);
  const shots: Manifest["shots"] = [];
  for (const shot of ranges) {
    const sheets = await buildContactSheets(sampled, shot, path.join(dir, "sheets"));
    const stillFrames = [...new Set([shot.from + Math.floor(shot.durationInFrames / 2), shot.from + shot.durationInFrames - 1])];
    const stills = [];
    for (const f of stillFrames) stills.push({ file: await extractFrame(refFile, f, info.fps, path.join(dir, "full", `full_${f}.jpg`)), frame: f - shot.from });
    shots.push({ ...shot, id: shotId(shot.index), sheets: sheets.map((s) => s.file), stills });
  }
  const strip = await thumbnailStrip(sampled, ranges, path.join(dir, "sheets", "strip.jpg"));
  writeJson(path.join(sdir, "manifest.json"), { info, sampled, shots, strip } satisfies Manifest);

  const schema = schemaFile(sdir, "shot-analysis", ShotAnalysisSchema);
  fs.writeFileSync(
    path.join(sdir, "shot-brief.md"),
    `${SHOT_ANALYSIS_SYSTEM}\n\n## Output\n\nWrite ONE JSON object (no markdown fence) that validates against the JSON Schema in:\n${schema}\nEvery field in the schema is required; unused nullable fields are null.\n`,
  );
  const tasks: string[] = [];
  for (const s of shots) {
    const out = path.join(sdir, "shots", `${s.id}.json`);
    const task = path.join(sdir, "shots", `${s.id}.task.md`);
    fs.mkdirSync(path.dirname(task), { recursive: true });
    fs.writeFileSync(
      task,
      `# Task: analyze ${s.id}

Follow the brief: ${path.join(sdir, "shot-brief.md")}

${shotAnalysisUser({ shotIndex: s.index, shotCount: shots.length, from: s.from, durationInFrames: s.durationInFrames, fps: info.fps, width: info.width, height: info.height, sampleStep: sampled.step })}

## Images (read every one)
${s.sheets.map((f, i) => `- Contact sheet ${i + 1}/${s.sheets.length}: ${f}`).join("\n")}
${s.stills.map((st) => `- Full-resolution still at shot-relative frame f${st.frame}: ${st.file}`).join("\n")}

## Write the result to
${out}

Then check it with: npm run skill -- breakdown ${job.id}   (reports schema errors per shot; fix and re-run until this shot is OK)
`,
    );
    tasks.push(task);
  }
  updateJob(job.id, { phase: "awaiting shot analyses (Claude Code)", progress: 0.15 });

  console.log(`JOB=${job.id}`);
  console.log(`video ${info.width}x${info.height} @ ${info.fps} fps, ${info.durationInFrames} frames (${info.durationSec.toFixed(2)} s), audio=${info.hasAudio}`);
  console.log(`${shots.length} shot(s): ${shots.map((s) => `${s.id} [${s.from}+${s.durationInFrames}]`).join("  ")}`);
  console.log(`brief: ${path.join(sdir, "shot-brief.md")}`);
  console.log("tasks:");
  for (const t of tasks) console.log(`  ${t}`);
}

function loadAnalyses(jobId: string, m: Manifest): ShotAnalysis[] {
  const results = m.shots.map((s) => ({ s, r: validate(path.join(skillDir(jobId), "shots", `${s.id}.json`), ShotAnalysisSchema) }));
  const bad = results.filter((x) => !x.r.ok);
  for (const { s, r } of results) console.log(`${s.id}: ${r.ok ? "OK" : (r as { error: string }).error}`);
  if (bad.length) fail(`\n${bad.length}/${m.shots.length} shot(s) need fixing.`);
  return results.map((x) => (x.r as { value: ShotAnalysis }).value);
}

function breakdown(jobId: string) {
  const m = loadManifest(jobId);
  const analyses = loadAnalyses(jobId, m);
  const sdir = skillDir(jobId);
  const breakdownFile = path.join(sdir, "breakdown.json");
  writeJson(breakdownFile, compactBreakdown(analyses, m.shots, m.info.fps));
  const schema = schemaFile(sdir, "merge", MergeOutputSchema);
  const task = path.join(sdir, "merge.task.md");
  fs.writeFileSync(
    task,
    `# Task: merge shots into a template

${MERGE_SYSTEM}

## Inputs
Video: ${m.info.width}x${m.info.height} @ ${m.info.fps} fps, ${m.info.durationInFrames} frames (${m.info.durationSec.toFixed(2)} s), ${m.shots.length} shots.
- Thumbnail strip (one mid-shot frame per shot): ${m.strip}
- Per-shot breakdown (JSON): ${breakdownFile}

## Write
1. ${path.join(sdir, "merge.json")}: title, fonts, palette, fontMap, slots (everything except the motion prompt). It must validate against ${schema}. Member shotIds look like "shot-1"; candidateIds are the slotCandidates ids from the breakdown.
2. ${path.join(sdir, "motion-prompt.md")}: the Claude Motion Prompt (markdown).

Then run: npm run skill -- assemble ${jobId}
`,
  );
  updateJob(jobId, { phase: "awaiting merge (Claude Code)", progress: 0.7 });
  console.log(`\nall shots valid → merge task: ${task}`);
}

async function assemble(jobId: string) {
  const m = loadManifest(jobId);
  const analyses = loadAnalyses(jobId, m);
  const sdir = skillDir(jobId);
  const merge = validate(path.join(sdir, "merge.json"), MergeOutputSchema);
  if (!merge.ok) fail(`merge.json: ${merge.error}`);
  const promptFile = path.join(sdir, "motion-prompt.md");
  if (!fs.existsSync(promptFile)) fail(`missing ${promptFile}`);

  const dir = jobDir(jobId);
  const logs: string[] = [];
  const spec = await assembleSpec({ jobDir: dir, refFile: path.join(dir, REF_NAME), info: m.info, sampled: m.sampled, shots: m.shots, analyses, merge: merge.value, log: (l) => logs.push(l) });
  writeSpec(jobId, spec);
  fs.copyFileSync(promptFile, promptPath(jobId));
  writeJson(path.join(dir, "shot-analyses.json"), analyses);
  updateJob(jobId, { status: "ready", phase: "ready", progress: 1, hasSpec: true, error: null });

  for (const l of logs) console.log(`warn: ${l}`);
  console.log(`spec:          ${path.join(dir, "spec.json")}`);
  console.log(`motion prompt: ${promptPath(jobId)}`);
  console.log(`${spec.slots.length} slot(s):`);
  for (const s of spec.slots) console.log(`  ${s.id.padEnd(22)} ${s.kind.padEnd(6)} ${s.label}`);
}

type Best = Record<string, { shot: Shot; mean: number }>;
type Report = { iteration: number; mean: number; byShot: { shotId: string; mean: number; worstFrame: number }[] }[];

async function refine(jobId: string) {
  let spec = readSpec(jobId);
  if (!spec) fail("no spec yet: run assemble first");
  const m = loadManifest(jobId);
  const dir = jobDir(jobId);
  const rdir = path.join(skillDir(jobId), "refine");
  fs.mkdirSync(rdir, { recursive: true });
  const reportFile = path.join(rdir, "report.json");
  const bestFile = path.join(rdir, "best.json");
  const report: Report = fs.existsSync(reportFile) ? readJson(reportFile) : [];
  const best: Best = fs.existsSync(bestFile) ? readJson(bestFile) : {};
  const it = report.length;

  // Apply the fixes written for the previous pass.
  if (it > 0) {
    const fixDir = path.join(rdir, `iter${it - 1}`, "fixes");
    const slotIds = new Set(spec.slots.map((s) => s.id));
    const files = fs.existsSync(fixDir) ? fs.readdirSync(fixDir).filter((f) => f.endsWith(".json")) : [];
    let bad = 0;
    for (const f of files) {
      const r = validate(path.join(fixDir, f), RefineResultSchema);
      const id = path.basename(f, ".json");
      if (!r.ok) {
        console.log(`fix ${id}: ${r.error}`);
        bad++;
        continue;
      }
      console.log(`fix ${id}: ${r.value.notes.slice(0, 200)}`);
      spec = {
        ...spec,
        shots: spec.shots.map((s) => {
          if (s.id !== id) return s;
          const next = sanitizeShot({ ...s, background: r.value.background, transitionIn: r.value.transitionIn, camera: r.value.camera, layers: r.value.layers });
          return { ...next, layers: next.layers.map((l) => (l.slotId && !slotIds.has(l.slotId) ? { ...l, slotId: null } : l)) };
        }),
      };
    }
    if (bad) fail(`\n${bad} fix file(s) invalid; correct them and re-run refine.`);
    writeSpec(jobId, spec);
  }

  console.log(`pass ${it}: rendering preview…`);
  const renderFile = path.join(rdir, `iter${it}.mp4`);
  await renderSpec({ spec, values: {}, assetDir: dir, outFile: renderFile, scale: 0.5, muted: true });
  const ssim = await compareSsim(path.join(dir, REF_NAME), renderFile, path.join(rdir, `iter${it}_ssim.log`));
  const byShot = ssimByShot(ssim.perFrame, spec.shots);
  report.push({ iteration: it, mean: ssim.mean, byShot });
  for (const score of byShot) {
    if (!best[score.shotId] || score.mean > best[score.shotId].mean) best[score.shotId] = { shot: spec.shots.find((s) => s.id === score.shotId)!, mean: score.mean };
  }
  writeJson(reportFile, report);
  writeJson(bestFile, best);
  updateJob(jobId, { ssim: { mean: ssim.mean, byShot: byShot.map(({ shotId, mean }) => ({ shotId, mean })) } });

  console.log(`SSIM=${ssim.mean.toFixed(3)}`);
  for (const s of byShot) console.log(`  ${s.shotId}: ${s.mean.toFixed(3)}${s.mean >= TARGET_SSIM ? " ✓" : ""}`);

  const weak = byShot.filter((s) => s.mean < TARGET_SSIM).sort((a, b) => a.mean - b.mean).slice(0, MAX_FIXES_PER_PASS);
  if (weak.length === 0) {
    console.log(`\nevery shot ≥ ${TARGET_SSIM}. Run: npm run skill -- finish ${jobId}`);
    return;
  }

  const idir = path.join(rdir, `iter${it}`);
  const renderSampled = await sampleFrames(renderFile, path.join(idir, "frames"), spec.fps);
  const schema = schemaFile(rdir, "refine", RefineResultSchema);
  const brief = path.join(rdir, "refine-brief.md");
  fs.writeFileSync(brief, `${REFINE_SYSTEM}\n\n## Output\n\nWrite ONE JSON object (no markdown fence) that validates against:\n${schema}\n`);
  console.log("\nfix tasks:");
  for (const score of weak) {
    const shot = spec.shots.find((s) => s.id === score.shotId)!;
    const sheet = await comparisonSheet(m.sampled, renderSampled, shot, path.join(idir, `${shot.id}_compare.jpg`), ssim.perFrame);
    const current = path.join(idir, `${shot.id}.current.json`);
    writeJson(current, { background: shot.background, transitionIn: shot.transitionIn, camera: shot.camera, layers: shot.layers });
    const task = path.join(idir, `${shot.id}.task.md`);
    fs.writeFileSync(
      task,
      `# Task: fix ${shot.id}

Follow the brief: ${brief}

Frame ${spec.width}x${spec.height} @ ${spec.fps} fps. Shot ${shot.id} (${shot.durationInFrames} frames). Mean SSIM ${score.mean.toFixed(3)}; worst at shot-relative f${score.worstFrame - shot.from}.

- Comparison sheet (left ORIGINAL, right RENDER): ${sheet}
- Current shot JSON: ${current}
- Slots available: ${JSON.stringify(spec.slots.map((s) => ({ id: s.id, kind: s.kind, label: s.label })))}

## Write the corrected shot to
${path.join(idir, "fixes", `${shot.id}.json`)}
`,
    );
    console.log(`  ${task}`);
  }
  fs.mkdirSync(path.join(idir, "fixes"), { recursive: true });
  console.log(`\nwrite the fixes, then run: npm run skill -- refine ${jobId}   (applies + re-scores)   or   finish ${jobId} to stop here`);
}

function finish(jobId: string) {
  const spec = readSpec(jobId);
  if (!spec) fail("no spec yet");
  const rdir = path.join(skillDir(jobId), "refine");
  const best: Best = fs.existsSync(path.join(rdir, "best.json")) ? readJson(path.join(rdir, "best.json")) : {};
  const final = { ...spec, shots: spec.shots.map((s) => best[s.id]?.shot ?? s) };
  writeSpec(jobId, final);
  const byShot = final.shots.map((s) => ({ shotId: s.id, mean: best[s.id]?.mean ?? 0 }));
  const scored = byShot.filter((s) => best[s.shotId]);
  const frames = (id: string) => final.shots.find((s) => s.id === id)!.durationInFrames;
  const total = scored.reduce((a, s) => a + frames(s.shotId), 0);
  const mean = total ? scored.reduce((a, s) => a + s.mean * frames(s.shotId), 0) / total : null;
  updateJob(jobId, { status: "ready", phase: "ready", hasSpec: true, ssim: mean == null ? getJob(jobId)?.ssim ?? null : { mean, byShot } });
  console.log(mean == null ? "no refine passes recorded; spec unchanged" : `kept best version of each shot · SSIM≈${mean.toFixed(3)}`);
}

const [cmd, arg] = process.argv.slice(2);
const commands: Record<string, (a: string) => unknown> = { prepare, breakdown, assemble, refine, finish };
if (!commands[cmd] || !arg) fail("usage: npm run skill -- prepare <video> | breakdown|assemble|refine|finish <jobId>");
Promise.resolve(commands[cmd](arg)).then(() => process.exit(0)).catch((err) => fail(err instanceof Error ? (err.stack ?? err.message) : String(err)));
