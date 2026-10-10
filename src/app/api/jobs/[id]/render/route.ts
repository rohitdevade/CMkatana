import { NextResponse } from "next/server";
import { enqueue } from "@/jobs/queue";
import { getJob, updateJob } from "@/jobs/store";
import { runRender } from "@/pipeline/runRender";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const job = getJob(id);
  if (!job?.hasSpec) return NextResponse.json({ error: "job has no spec yet" }, { status: 400 });
  if (job.status === "analyzing") return NextResponse.json({ error: "analysis still running" }, { status: 409 });
  if (enqueue(`render:${id}`, () => runRender(id))) {
    updateJob(id, { status: "rendering", phase: "queued for render", progress: 0, output: null });
  }
  return NextResponse.json({ ok: true });
}
