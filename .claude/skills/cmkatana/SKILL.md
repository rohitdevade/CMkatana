---
name: cmkatana
description: Turn a motion-graphics reference video into an editable template and re-render it with the user's own assets (same motion, cuts and timing). Opens a local browser upload box for the reference video, runs the Claude analysis (MotionSpec + Motion Prompt), opens an asset upload page for every replaceable slot (logo, images, footage, text, colors), then renders the final MP4. Use when the user wants to copy/recreate/template a motion-graphics video, swap assets into a reference video, or says "/cmkatana".
---

# CMkatana: reference video → template → your assets → MP4

Run every command from the project root. Each step uses the existing CLIs (`npm run analyze`, `npm run render`). The browser pages come from `npm run upload` ([scripts/upload.ts](../../../scripts/upload.ts)).

## 0. Preflight (once per session)

- `node_modules` missing → `npm install`.
- Analysis needs Claude credentials: `ANTHROPIC_API_KEY` in `.env.local` (copy from `.env.example`) or an `ant auth login` profile. If neither is present, stop and tell the user. Don't ask them to paste the key into chat.

## 1. Get the reference video

If the user already gave a video path, or one is attached in `samples/`, skip to step 2 with refine passes defaulting to `1`.

Otherwise open the upload box. Run it **in the background** (it blocks until the user uploads):

```
npm run upload -- video
```

It prints `Upload page: http://127.0.0.1:<port>/` and opens the browser. Pass that URL to the user in case the browser didn't open. When the user drops a file and clicks **Analyze**, the process prints the lines below and exits, which wakes you up:

```
VIDEO=<absolute path in samples/>
REFINE=<0-3 accuracy passes the user picked>
```

## 2. Analyze

Run in the background (it takes minutes; cost scales with shot count):

```
npm run analyze -- "<VIDEO>" --refine <REFINE>
```

Its first line is `job <jobId> → <dir>`. Write down the job id. When it finishes:
- Read `storage/jobs/<jobId>/spec.json → slots` and give the user a short table: slot id, kind, label.
- Mention `motion-prompt.md` (the Claude Motion Prompt) and offer to show it.
- If the job's `ssim.mean` is in `storage/jobs/<jobId>/job.json`, report it as the accuracy score.

If it fails, show the error from the output or `job.json → error`.

## 3. Upload the assets

Run in the background:

```
npm run upload -- assets <jobId>
```

This opens a page with one card per slot: drop zones for image/video slots (with the original crop as a thumbnail), text inputs for text slots, color pickers for color slots. Uploaded files go into `storage/jobs/<jobId>/uploads/`. When the user clicks **Save & render** (or **Keep originals**), it writes `storage/jobs/<jobId>/values.json`, prints the lines below and exits:

```
VALUES=<path to values.json>
CHANGED=<comma-separated slot ids, or (none)>
```

If the user would rather describe changes in chat (for example "headline should say Launch Day, brand color #00c2ff"), skip the page: write `values.json` yourself in the same shape (`{ "<slotId>": { "text" | "src" | "color": ... } }`, with `src` as a local absolute path or `uploads/<file>`).

## 4. Render

```
npm run render -- <jobId> "<VALUES>"
```

Run it in the background. The first render downloads Remotion's headless Chrome. It ends with `wrote <path>.mp4`. Give the user that path.

## Follow-ups

- Different assets on the same template: repeat steps 3–4 with the same job id. No re-analysis is needed.
- Preview, timing tweaks, or the JSON editor: `npm run dev` and open `http://localhost:3000/jobs/<jobId>`.
- A cheap check of cuts with no Claude calls: `npm run analyze -- "<VIDEO>" --dry`.
- `--no-open` on `npm run upload` skips launching the browser (for example on a remote machine). Just give the user the URL.
