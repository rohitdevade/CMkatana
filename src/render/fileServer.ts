import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { mimeFor, parseRange } from "./http";

/** Tiny static server (with Range support) so the headless renderer can load job assets over HTTP. */
export async function serveDir(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const absRoot = path.resolve(root);
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    const file = path.resolve(absRoot, "." + rel);
    if (!file.startsWith(absRoot) || !fs.existsSync(/*turbopackIgnore: true*/ file) || !fs.statSync(/*turbopackIgnore: true*/ file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(/*turbopackIgnore: true*/ file).size;
    const range = parseRange(req.headers.range, size);
    const headers = { "Content-Type": mimeFor(file), "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
    if (range) {
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": range.end - range.start + 1 });
      fs.createReadStream(/*turbopackIgnore: true*/ file, range).pipe(res);
    } else {
      res.writeHead(200, { ...headers, "Content-Length": size });
      fs.createReadStream(/*turbopackIgnore: true*/ file).pipe(res);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
