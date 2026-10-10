import path from "node:path";
import { getJob, jobDir, logJob, readSpec, updateJob } from "../jobs/store";
import { renderSpec } from "../render/render";

/** Final render of a job with the user's slot values. Writes output.mp4 into the job dir. */
export async function runRender(jobId: string): Promise<string> {
  const job = getJob(jobId);
  const spec = readSpec(jobId);
  if (!job || !spec) throw new Error("job has no spec yet");

  const outRel = "output.mp4";
  try {
    updateJob(jobId, { status: "rendering", phase: "rendering", progress: 0, error: null });
    logJob(jobId, "render started");
    let last = 0;
    await renderSpec({
      spec,
      values: job.values,
      assetDir: jobDir(jobId),
      outFile: path.join(jobDir(jobId), outRel),
      onProgress: (p) => {
        // Throttle disk writes.
        if (p - last >= 0.02 || p === 1) {
          last = p;
          updateJob(jobId, { progress: p });
        }
      },
    });
    updateJob(jobId, { status: "done", phase: "done", progress: 1, output: outRel });
    logJob(jobId, "render complete");
    return outRel;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logJob(jobId, `RENDER ERROR: ${msg}`);
    updateJob(jobId, { status: "ready", phase: "render failed", error: msg });
    throw err;
  }
}
