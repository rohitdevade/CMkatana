import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { jobDir } from "@/jobs/store";
import { mimeFor, parseRange } from "@/render/http";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; path: string[] }> };

/** Serves job files (reference video, crops, uploads, output) with Range support for video seeking. */
export async function GET(req: Request, { params }: Ctx) {
  const { id, path: parts } = await params;
  let root: string;
  try {
    root = path.resolve(jobDir(id));
  } catch {
    return new Response("not found", { status: 404 });
  }
  const file = path.resolve(root, ...parts);
  if (!file.startsWith(root + path.sep) || path.basename(file) === "job.json" || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return new Response("not found", { status: 404 });
  }
  const size = fs.statSync(file).size;
  const headers: Record<string, string> = { "Content-Type": mimeFor(file), "Accept-Ranges": "bytes", "Cache-Control": "no-cache" };
  if (new URL(req.url).searchParams.has("download")) headers["Content-Disposition"] = `attachment; filename="${path.basename(file)}"`;

  const range = parseRange(req.headers.get("range"), size);
  if (range) {
    const body = Readable.toWeb(fs.createReadStream(file, range)) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": String(range.end - range.start + 1) },
    });
  }
  const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(size) } });
}
