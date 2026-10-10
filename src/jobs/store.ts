import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MotionSpec, SlotValues } from "../spec/schema";

export type JobStatus = "queued" | "analyzing" | "ready" | "rendering" | "done" | "error";

export type Job = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  /** 0..1 progress of the current phase. */
  progress: number;
  phase: string;
  log: { t: string; msg: string }[];
  error: string | null;
  originalName: string;
  /** Slot values chosen by the user. */
  values: SlotValues;
  hasSpec: boolean;
  ssim: { mean: number; byShot: { shotId: string; mean: number }[] } | null;
  output: string | null;
};

export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));
const JOB_ID = /^[a-z0-9-]{6,64}$/;

export function jobDir(id: string): string {
  if (!JOB_ID.test(id)) throw new Error(`invalid job id: ${id}`);
  return path.join(STORAGE_DIR, "jobs", id);
}

const jobFile = (id: string) => path.join(jobDir(id), "job.json");

export function createJob(originalName: string): Job {
  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(4).toString("hex")}`;
  fs.mkdirSync(jobDir(id), { recursive: true });
  const now = new Date().toISOString();
  const job: Job = {
    id,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    progress: 0,
    phase: "queued",
    log: [],
    error: null,
    originalName,
    values: {},
    hasSpec: false,
    ssim: null,
    output: null,
  };
  saveJob(job);
  return job;
}

export function getJob(id: string): Job | null {
  try {
    return JSON.parse(fs.readFileSync(jobFile(id), "utf8")) as Job;
  } catch {
    return null;
  }
}

function saveJob(job: Job): void {
  job.updatedAt = new Date().toISOString();
  const tmp = jobFile(job.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(job, null, 2));
  fs.renameSync(tmp, jobFile(job.id));
}

export function updateJob(id: string, patch: Partial<Job> | ((job: Job) => void)): Job {
  const job = getJob(id);
  if (!job) throw new Error(`job not found: ${id}`);
  if (typeof patch === "function") patch(job);
  else Object.assign(job, patch);
  saveJob(job);
  return job;
}

export function logJob(id: string, msg: string): void {
  console.log(`[${id}] ${msg}`);
  updateJob(id, (j) => {
    j.log.push({ t: new Date().toISOString(), msg });
    if (j.log.length > 500) j.log.splice(0, j.log.length - 500);
  });
}

export function listJobs(): Job[] {
  const dir = path.join(STORAGE_DIR, "jobs");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((id) => (JOB_ID.test(id) ? getJob(id) : null))
    .filter((j): j is Job => Boolean(j))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const specPath = (id: string) => path.join(jobDir(id), "spec.json");
export const promptPath = (id: string) => path.join(jobDir(id), "motion-prompt.md");

export function readSpec(id: string): MotionSpec | null {
  try {
    return JSON.parse(fs.readFileSync(specPath(id), "utf8")) as MotionSpec;
  } catch {
    return null;
  }
}

export function writeSpec(id: string, spec: MotionSpec): void {
  fs.writeFileSync(specPath(id), JSON.stringify(spec, null, 2));
}
