import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { enqueue } from "@/jobs/queue";
import { createJob, jobDir, listJobs } from "@/jobs/store";
import { REF_NAME } from "@/pipeline/mergeSpec";
import { runAnalysis } from "@/pipeline/runAnalysis";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(listJobs().map(({ log: _log, ...j }) => j));
}

/** multipart/form-data: file (video), refine (iterations, default 1) */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "missing video file" }, { status: 400 });
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|webm|mkv|m4v)$/i.test(file.name)) {
    return NextResponse.json({ error: "upload a video file (mp4, mov, webm)" }, { status: 400 });
  }
  const refine = Math.min(3, Math.max(0, Number(form.get("refine") ?? 1) || 0));

  const job = createJob(file.name);
  await pipeline(Readable.fromWeb(file.stream() as NodeReadableStream), fs.createWriteStream(path.join(jobDir(job.id), REF_NAME)));
  enqueue(`analyze:${job.id}`, () => runAnalysis(job.id, { refineIterations: refine }));
  return NextResponse.json({ id: job.id });
}
