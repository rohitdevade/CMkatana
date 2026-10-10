---
name: cmkatana
description: Turn a motion-graphics reference video into an editable template and re-render it with the user's own assets (same motion, cuts and timing). Opens a local browser upload box for the reference video, analyzes it frame by frame (you, Claude Code, do the vision work, so no API key is needed), opens an asset upload page for every replaceable slot (logo, images, footage, text, colors), then renders the final MP4. Use when the user wants to copy/recreate/template a motion-graphics video, swap assets into a reference video, or says "/cmkatana".
---

# CMkatana: reference video → template → your assets → MP4

**You are the vision model.** The scripts do everything local: ffmpeg, contact sheets, schema validation, assembly, Remotion rendering and SSIM scoring. You read the frames and write JSON. No `ANTHROPIC_API_KEY` is needed and none should be asked for. Never run `npm run analyze`; it is the separate API-key pipeline.

Run every command from the project root. Long steps (render, refine) go in the background.

## 0. Preflight

`node_modules` missing → `npm install`. The first render downloads Remotion's headless Chrome (~120 MB), once.

## 1. Get the reference video

If the user gave a path, use it with `REFINE=1`. Otherwise start the upload box in the background (it blocks until the user uploads):

```
npm run upload -- video
```

Give the user the printed `Upload page: http://127.0.0.1:<port>/` URL; the script also opens it in their browser. When they drop a file and click **Analyze**, the script prints `VIDEO=<path>` and `REFINE=<0-3>`, then exits.

## 2. Prepare

```
npm run skill -- prepare "<VIDEO>"
```

This prints `JOB=<jobId>`, the shot list, the brief path and one task file per shot.

## 3. Analyze each shot (vision)

Read `storage/jobs/<jobId>/skill/shot-brief.md` once. It holds the analysis rules, the MotionSpec conventions and the JSON Schema path. Then, for each `skill/shots/shot-N.task.md`:

1. Read the task, then **Read every image it lists**: the contact sheets (tiles labeled `fN` = shot-relative frame) and the full-resolution stills.
2. Measure from the tiles. Positions are normalized centers. A tile is ~480 px wide in the sheet, so divide by the tile size, not the sheet size. Timing comes from the frame where motion starts and the frame where it settles.
3. Write the `ShotAnalysis` JSON to the path in the task.

**More than 2 shots:** spawn one subagent per shot (Agent tool, all in one message, so they run in parallel). Give each one this prompt: "Read <brief path>, then do <task path>: Read every listed image, write the JSON to the given path, and run `npm run skill -- breakdown <jobId>` until your shot is OK." The skill only needs the files they write.

Then validate:

```
npm run skill -- breakdown <jobId>
```

It reports `OK` or concrete schema errors per shot. Fix and re-run until every shot is OK. Then it writes `skill/merge.task.md`.

## 4. Merge

Read `merge.task.md` and the thumbnail strip it points to. Write `skill/merge.json`, which unifies the slots across shots, and `skill/motion-prompt.md`, the Claude Motion Prompt. Then:

```
npm run skill -- assemble <jobId>
```

This writes `spec.json` and prints the slot table. Show the user the slot table and offer the Motion Prompt.

## 5. Accuracy passes (REFINE times; skip if 0)

```
npm run skill -- refine <jobId>
```

This renders the spec with the original assets and scores it against the reference (SSIM per shot; the target is 0.975). If every shot passes, go to finish. Otherwise it writes `skill/refine/iterK/<shotId>.task.md` for each weak shot. For each one:

1. Read the comparison sheet (left ORIGINAL, right RENDER) and the current shot JSON.
2. Fix what visibly differs: size, position, timing, easing, colors, missing elements.
3. Write the corrected shot to the `fixes/` path in the task.

Re-run `refine` to apply the fixes and re-score. After REFINE fix rounds, or when everything passes, run:

```
npm run skill -- finish <jobId>
```

This keeps each shot's best-scoring version. Report the final SSIM.

## 6. Upload the assets

Run in the background:

```
npm run upload -- assets <jobId>
```

The page shows one card per slot: drop zones for image and video slots (with the original crop as a thumbnail), text inputs and color pickers. **Save & render** writes `storage/jobs/<jobId>/values.json` and prints `VALUES=<path>`. If the user describes the changes in chat instead, write `values.json` yourself: `{ "<slotId>": { "text" | "src" | "color": ... } }`, where `src` is an absolute local path.

## 7. Render

```
npm run render -- <jobId> "<VALUES>"
```

Run it in the background. It ends with `wrote <path>/output.mp4`. Give the user that path.

## Follow-ups

- New assets on the same template: repeat steps 6–7. No re-analysis needed.
- Visual preview and JSON editing: `npm run dev`, then open `http://localhost:3000/jobs/<jobId>`. The web app's own "analyze" button uses the API-key pipeline; previewing and rendering don't need a key.
- `--no-open` on `npm run upload` skips launching the browser. `--target 0.99` on `refine` sets a stricter bar.
