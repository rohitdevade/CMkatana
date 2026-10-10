import fs from "node:fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getJob, promptPath, readSpec, updateJob, writeSpec } from "@/jobs/store";
import { sanitizeSpec } from "@/spec/sanitize";
import { MotionSpecSchema, SlotValueSchema } from "@/spec/schema";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  const spec = job.hasSpec ? readSpec(id) : null;
  const motionPrompt = job.hasSpec && fs.existsSync(promptPath(id)) ? fs.readFileSync(promptPath(id), "utf8") : null;
  return NextResponse.json({ job, spec, motionPrompt });
}

const PatchSchema = z.object({
  values: z.record(z.string(), SlotValueSchema).optional(),
  spec: MotionSpecSchema.optional(),
});

/** Update slot values and/or replace the spec (hand edits from the JSON tab). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!getJob(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  if (parsed.data.spec) writeSpec(id, sanitizeSpec(parsed.data.spec));
  const job = updateJob(id, (j) => {
    if (parsed.data.values) j.values = parsed.data.values;
  });
  return NextResponse.json({ job, spec: readSpec(id) });
}
