import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { MotionSpec, SlotValues, SpecVideoProps } from "../spec/schema";
import { serveDir } from "./fileServer";

const COMPOSITION_ID = "SpecVideo";
let bundlePromise: Promise<string> | null = null;

/** Bundles the Remotion project once per process. */
export function getBundle(): Promise<string> {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: path.join(process.cwd(), "src", "remotion", "index.ts"),
      onProgress: () => undefined,
    }).catch((err) => {
      bundlePromise = null;
      throw err;
    });
  }
  return bundlePromise;
}

export type RenderOptions = {
  spec: MotionSpec;
  values: SlotValues;
  /** Directory that job-relative asset paths resolve against. */
  assetDir: string;
  outFile: string;
  /** 0..1 — e.g. 0.5 renders at half resolution (used by the refinement loop). */
  scale?: number;
  /** Render only these frames (inclusive), e.g. for a quick preview. */
  frameRange?: [number, number];
  muted?: boolean;
  onProgress?: (progress: number) => void;
};

export async function renderSpec(opts: RenderOptions): Promise<string> {
  const serveUrl = await getBundle();
  const files = await serveDir(opts.assetDir);
  try {
    const inputProps: SpecVideoProps = { spec: opts.spec, values: opts.values, assetBase: files.url, debug: false };
    const composition = await selectComposition({ serveUrl, id: COMPOSITION_ID, inputProps });
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: opts.outFile,
      inputProps,
      scale: opts.scale ?? 1,
      frameRange: opts.frameRange ?? null,
      muted: opts.muted ?? false,
      imageFormat: "jpeg",
      jpegQuality: 90,
      timeoutInMilliseconds: 120000,
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
    return opts.outFile;
  } finally {
    await files.close();
  }
}
