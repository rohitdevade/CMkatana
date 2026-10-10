import fs from "node:fs";
import path from "node:path";
import { renderSpec } from "../src/render/render";
import { sampleSpec } from "../src/remotion/sampleSpec";

async function main() {
  const outDir = path.resolve("storage", "sample");
  fs.mkdirSync(outDir, { recursive: true });
  const values = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], "utf8")) : {};
  const out = await renderSpec({
    spec: sampleSpec,
    values,
    assetDir: outDir,
    outFile: path.join(outDir, "sample.mp4"),
    onProgress: (p) => process.stdout.write(`\rrendering ${(p * 100).toFixed(0)}%`),
  });
  console.log(`\nwrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
