/**
 * Usage: npm run render -- <jobId> [values.json]
 * values.json maps slot ids to replacements, e.g.
 *   { "logo": { "src": "C:/brand/logo.png" }, "headline": { "text": "Hello" }, "brand_color": { "color": "#00c2ff" } }
 * Local file paths are copied into the job's uploads/ folder.
 */
import fs from "node:fs";
import path from "node:path";
import { getJob, jobDir, updateJob } from "../src/jobs/store";
import { runRender } from "../src/pipeline/runRender";
import type { SlotValues } from "../src/spec/schema";

async function main() {
  const [jobId, valuesFile] = process.argv.slice(2);
  if (!jobId || !getJob(jobId)) {
    console.error("usage: npm run render -- <jobId> [values.json]");
    process.exit(1);
  }
  if (valuesFile) {
    const values = JSON.parse(fs.readFileSync(valuesFile, "utf8")) as SlotValues;
    const uploads = path.join(jobDir(jobId), "uploads");
    fs.mkdirSync(uploads, { recursive: true });
    for (const [slotId, v] of Object.entries(values)) {
      if (v.src && !/^https?:/.test(v.src) && fs.existsSync(v.src)) {
        const name = `${slotId}${path.extname(v.src)}`;
        fs.copyFileSync(v.src, path.join(uploads, name));
        v.src = `uploads/${name}`;
      }
    }
    updateJob(jobId, { values });
  }
  const out = await runRender(jobId);
  console.log(`\nwrote ${path.join(jobDir(jobId), out)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
