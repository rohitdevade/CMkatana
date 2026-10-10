/**
 * Local browser upload pages for the CMkatana skill.
 *
 *   npm run upload -- video [--no-open]           drop a reference video → prints VIDEO=<path> and REFINE=<n>, then exits
 *   npm run upload -- assets <jobId> [--no-open]  upload/replace slot assets → writes <job>/values.json, prints VALUES=<path>, then exits
 *
 * Files are streamed straight to disk (PUT with a raw body), so there is no multipart parsing and no size limit.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { getJob, jobDir, readSpec } from "../src/jobs/store";
import { mimeFor, parseRange } from "../src/render/http";
import type { Slot, SlotValues } from "../src/spec/schema";

const SAMPLES_DIR = path.resolve("samples");

const safeName = (name: string) => path.basename(name).replace(/[^\w.-]+/g, "_").slice(-120) || "upload";
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const jsonForScript = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

function openBrowser(url: string) {
  if (process.argv.includes("--no-open")) return;
  const [cmd, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function saveStream(req: http.IncomingMessage, file: string): Promise<void> {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(file);
    req.pipe(out);
    out.on("finish", resolve);
    out.on("error", reject);
    req.on("error", reject);
  });
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, root: string, rel: string) {
  const file = path.resolve(root, "." + rel);
  if (!file.startsWith(path.resolve(root)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  const size = fs.statSync(file).size;
  const range = parseRange(req.headers.range, size);
  const headers = { "Content-Type": mimeFor(file), "Accept-Ranges": "bytes" };
  if (range) {
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${range.start}-${range.end}/${size}`, "Content-Length": range.end - range.start + 1 });
    fs.createReadStream(file, range).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "Content-Length": size });
    fs.createReadStream(file).pipe(res);
  }
}

const json = (res: http.ServerResponse, status: number, body: unknown) =>
  res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));

const STYLE = `
:root { --bg:#f6f6f4; --card:#fff; --ink:#18181b; --muted:#6b6b73; --line:#e2e2de; --accent:#4f46e5; --accent-ink:#fff; --ok:#15803d; }
@media (prefers-color-scheme: dark) { :root { --bg:#111113; --card:#1b1b1f; --ink:#ececf0; --muted:#9a9aa3; --line:#2c2c33; --accent:#818cf8; --accent-ink:#111113; --ok:#4ade80; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 40px auto; padding: 0 16px; }
h1 { font-size: 22px; margin: 0 0 4px; } p.sub { color: var(--muted); margin: 0 0 24px; }
.drop { border: 2px dashed var(--line); border-radius: 14px; background: var(--card); padding: 48px 20px; text-align: center; cursor: pointer; transition: border-color .15s; }
.drop.over, .drop:hover { border-color: var(--accent); }
.drop small { color: var(--muted); display:block; margin-top: 6px; }
.bar { height: 6px; background: var(--line); border-radius: 3px; overflow: hidden; margin-top: 16px; display:none; }
.bar > div { height: 100%; width: 0; background: var(--accent); transition: width .1s; }
.row { display:flex; gap: 12px; align-items:center; margin-top: 20px; flex-wrap: wrap; }
select, input[type=text] { font: inherit; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
input[type=text] { width: 100%; }
button { font: inherit; font-weight: 600; border: 0; border-radius: 8px; padding: 10px 18px; background: var(--accent); color: var(--accent-ink); cursor: pointer; }
button.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
button:disabled { opacity: .5; cursor: default; }
.slot { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 12px; display: grid; grid-template-columns: 120px 1fr; gap: 16px; align-items: center; }
.slot .thumb { width: 120px; height: 80px; border-radius: 8px; background: var(--bg) center/contain no-repeat; border: 1px solid var(--line); overflow: hidden; display:flex; align-items:center; justify-content:center; color: var(--muted); font-size: 12px; }
.slot .thumb img, .slot .thumb video { max-width: 100%; max-height: 100%; }
.slot h3 { margin: 0; font-size: 15px; } .slot .kind { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.slot p { margin: 2px 0 10px; color: var(--muted); font-size: 13px; }
.slot .drop { padding: 12px; font-size: 13px; }
.status { color: var(--ok); font-weight: 600; }
@media (max-width: 520px) { .slot { grid-template-columns: 1fr; } }
`;

const page = (title: string, body: string, script: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body><main>${body}</main><script>
function upload(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(x.responseText));
    x.onerror = () => reject(new Error("upload failed"));
    x.send(file);
  });
}
function wireDrop(el, input, onFile) {
  el.addEventListener("click", () => input.click());
  el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
  el.addEventListener("dragleave", () => el.classList.remove("over"));
  el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
  input.addEventListener("change", () => input.files[0] && onFile(input.files[0]));
}
${script}
</script></body></html>`;

async function listen(handler: http.RequestListener): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((err) => json(res, 500, { error: String(err?.message ?? err) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/` };
}

function finish(server: http.Server, lines: string[]) {
  for (const l of lines) console.log(l);
  server.close();
  setTimeout(() => process.exit(0), 200).unref();
}

async function videoMode() {
  const html = page(
    "CMkatana upload",
    `<h1>Upload a reference video</h1>
<p class="sub">A motion-graphics clip (mp4, mov or webm). Claude will analyze it into an editable template.</p>
<input type="file" id="file" accept="video/*" hidden>
<div class="drop" id="drop"><strong>Drop video here</strong> or click to choose<small id="name">Nothing selected</small></div>
<div class="row">
  <label>Accuracy passes <select id="refine"><option>0</option><option selected>1</option><option>2</option><option>3</option></select></label>
  <button id="go" disabled>Analyze</button>
</div>
<div class="bar" id="bar"><div></div></div>
<p id="status"></p>`,
    `let picked = null;
const $ = (id) => document.getElementById(id);
wireDrop($("drop"), $("file"), (f) => { picked = f; $("name").textContent = f.name + " · " + (f.size / 1e6).toFixed(1) + " MB"; $("go").disabled = false; });
$("go").onclick = async () => {
  $("go").disabled = true; $("bar").style.display = "block";
  try {
    await upload("/upload?name=" + encodeURIComponent(picked.name) + "&refine=" + $("refine").value, picked, (p) => $("bar").firstElementChild.style.width = (p * 100) + "%");
    $("status").innerHTML = '<span class="status">Uploaded.</span> Claude is analyzing it now; you can close this tab and follow progress in Claude Code.';
  } catch (e) { $("status").textContent = "Error: " + e.message; $("go").disabled = false; }
};`,
  );

  const { server, url } = await listen(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && u.pathname === "/") return void res.writeHead(200, { "Content-Type": "text/html" }).end(html);
    if (req.method === "PUT" && u.pathname === "/upload") {
      const file = path.join(SAMPLES_DIR, safeName(u.searchParams.get("name") ?? "reference.mp4"));
      await saveStream(req, file);
      json(res, 200, { ok: true });
      const refine = Math.min(3, Math.max(0, Number(u.searchParams.get("refine") ?? 1) || 0));
      return finish(server, [`VIDEO=${file}`, `REFINE=${refine}`]);
    }
    res.writeHead(404).end();
  });
  console.log(`Upload page: ${url}`);
  openBrowser(url);
}

async function assetsMode(jobId: string) {
  const job = getJob(jobId);
  const spec = readSpec(jobId);
  if (!job || !spec) {
    console.error(`job ${jobId} has no spec yet; run the analysis first`);
    process.exit(1);
  }
  const dir = jobDir(jobId);
  const slots: Slot[] = spec.slots;
  const values: SlotValues = { ...job.values };

  const card = (s: Slot) => {
    const id = escapeHtml(s.id);
    const head = `<div><span class="kind">${s.kind} · ${id}</span><h3>${escapeHtml(s.label)}</h3><p>${escapeHtml(s.description)}</p>`;
    if (s.kind === "text")
      return `<div class="slot"><div class="thumb">Aa</div>${head}<input type="text" data-text="${id}" value="${escapeHtml(values[s.id]?.text ?? s.defaultText ?? "")}"></div></div>`;
    if (s.kind === "color") {
      const c = values[s.id]?.color ?? s.defaultColor ?? "#000000";
      return `<div class="slot"><div class="thumb" style="background:${escapeHtml(c)}"></div>${head}<input type="color" data-color="${id}" value="${escapeHtml(c)}"></div></div>`;
    }
    const accept = s.kind === "image" ? "image/*" : "video/*,image/*";
    return `<div class="slot"><div class="thumb" data-thumb="${id}"></div>${head}<input type="file" hidden accept="${accept}" data-file="${id}"><div class="drop" data-drop="${id}">Drop ${s.kind} or click to replace${s.aspect ? ` <small>original aspect ${s.aspect.toFixed(2)}:1</small>` : ""}</div></div></div>`;
  };

  const html = page(
    "CMkatana assets",
    `<h1>Replace assets</h1>
<p class="sub">${escapeHtml(spec.title)} · ${slots.length} slots · ${spec.width}×${spec.height} @ ${spec.fps} fps. Anything you leave alone keeps the original.</p>
${slots.map(card).join("\n")}
<div class="row"><button id="done">Save &amp; render</button><button class="ghost" id="skip">Keep originals</button><span id="status"></span></div>`,
    `const SLOTS = ${jsonForScript(slots)};
const VALUES = ${jsonForScript(values)};
const uploaded = {};
const q = (sel) => document.querySelector(sel);
function thumb(id, src, isVideo) {
  const el = q('[data-thumb="' + id + '"]');
  el.innerHTML = isVideo ? '<video src="' + src + '" muted autoplay loop playsinline></video>' : '<img src="' + src + '">';
}
for (const s of SLOTS) {
  if (s.kind !== "image" && s.kind !== "video") continue;
  const cur = (VALUES[s.id] && VALUES[s.id].src) || s.defaultSrc;
  if (cur && !/^https?:/.test(cur)) thumb(s.id, "/job/" + cur, /\\.(mp4|mov|webm)$/i.test(cur));
  const drop = q('[data-drop="' + s.id + '"]');
  wireDrop(drop, q('[data-file="' + s.id + '"]'), async (f) => {
    drop.textContent = "Uploading " + f.name + "…";
    try {
      const r = await upload("/upload?slot=" + encodeURIComponent(s.id) + "&name=" + encodeURIComponent(f.name), f, (p) => drop.textContent = "Uploading " + Math.round(p * 100) + "%");
      uploaded[s.id] = r.src;
      drop.innerHTML = '<span class="status">✓ ' + f.name + '</span> · click to change';
      thumb(s.id, "/job/" + r.src + "?t=" + Date.now(), f.type.startsWith("video"));
    } catch (e) { drop.textContent = "Error: " + e.message; }
  });
}
async function submit(keep) {
  const out = {};
  if (!keep) {
    for (const s of SLOTS) {
      if (uploaded[s.id]) out[s.id] = { src: uploaded[s.id] };
      const t = q('[data-text="' + s.id + '"]');
      if (t && t.value !== (s.defaultText || "")) out[s.id] = { text: t.value };
      const c = q('[data-color="' + s.id + '"]');
      if (c && c.value.toLowerCase() !== (s.defaultColor || "").toLowerCase()) out[s.id] = { color: c.value };
    }
  }
  q("#done").disabled = q("#skip").disabled = true;
  await fetch("/done", { method: "POST", body: JSON.stringify({ values: out, keep }) });
  q("#status").innerHTML = '<span class="status">Saved.</span> Rendering in Claude Code; you can close this tab.';
}
q("#done").onclick = () => submit(false);
q("#skip").onclick = () => submit(true);`,
  );

  const { server, url } = await listen(async (req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && u.pathname === "/") return void res.writeHead(200, { "Content-Type": "text/html" }).end(html);
    if (req.method === "GET" && u.pathname.startsWith("/job/")) return serveFile(req, res, dir, decodeURIComponent(u.pathname.slice(4)));
    if (req.method === "PUT" && u.pathname === "/upload") {
      const slotId = u.searchParams.get("slot") ?? "";
      if (!slots.some((s) => s.id === slotId)) return json(res, 400, { error: `unknown slot ${slotId}` });
      const ext = path.extname(safeName(u.searchParams.get("name") ?? "")).toLowerCase();
      const src = `uploads/${safeName(slotId)}${ext}`;
      await saveStream(req, path.join(dir, src));
      return json(res, 200, { src });
    }
    if (req.method === "POST" && u.pathname === "/done") {
      const body = JSON.parse(await readBody(req)) as { values: SlotValues; keep: boolean };
      const merged: SlotValues = body.keep ? {} : { ...values, ...body.values };
      const file = path.join(dir, "values.json");
      fs.writeFileSync(file, JSON.stringify(merged, null, 2));
      json(res, 200, { ok: true });
      return finish(server, [`VALUES=${file}`, `CHANGED=${Object.keys(merged).join(",") || "(none)"}`]);
    }
    res.writeHead(404).end();
  });
  console.log(`Assets page: ${url}`);
  openBrowser(url);
}

const [mode, jobId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (mode === "video") videoMode();
else if (mode === "assets" && jobId) assetsMode(jobId);
else {
  console.error("usage: npm run upload -- video | npm run upload -- assets <jobId>   [--no-open]");
  process.exit(1);
}
