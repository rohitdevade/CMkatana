import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getJob, jobDir, readSpec, updateJob } from "@/jobs/store";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const ALLOWED = /\.(png|jpe?g|webp|gif|svg|mp4|mov|webm)$/i;

/** multipart/form-data: slotId, file → stored under uploads/ and set as that slot's value. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const spec = readSpec(id);
  if (!getJob(id) || !spec) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const slotId = String(form.get("slotId") ?? "");
  const file = form.get("file");
  if (!spec.slots.some((s) => s.id === slotId)) return NextResponse.json({ error: "unknown slot" }, { status: 400 });
  if (!(file instanceof File) || !ALLOWED.test(file.name)) return NextResponse.json({ error: "unsupported file" }, { status: 400 });

  fs.mkdirSync(path.join(jobDir(id), "uploads"), { recursive: true });
  const rel = `uploads/${slotId}-${Date.now()}${path.extname(file.name).toLowerCase()}`;
  fs.writeFileSync(path.join(jobDir(id), rel), Buffer.from(await file.arrayBuffer()));

  const job = updateJob(id, (j) => {
    j.values[slotId] = { ...j.values[slotId], src: rel };
  });
  return NextResponse.json({ values: job.values, src: rel });
}
