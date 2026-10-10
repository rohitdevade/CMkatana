import { NextResponse } from "next/server";
import { enqueue } from "@/jobs/queue";
import { getJob } from "@/jobs/store";
import { runAnalysis } from "@/pipeline/runAnalysis";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Re-run analysis (e.g. after a failure). Body: { refine?: number } */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getJob(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { refine?: number };
  enqueue(`analyze:${id}`, () => runAnalysis(id, { refineIterations: Math.min(3, Math.max(0, body.refine ?? 1)) }));
  return NextResponse.json({ ok: true });
}
