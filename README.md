# CMkatana

Upload any motion-graphics video and get back:

1. **A Claude Motion Prompt**: a precise shot-by-shot description of every element, its text, font, color, position and motion, with frame timings and easing.
2. **A MotionSpec**: the same video as frame-accurate, editable JSON (layers, keyframes, easing, transitions, cuts).
3. **A template**: every logo, image, footage region, text block and brand color becomes a replaceable *slot*. Upload your own assets and the video re-renders with the **same motion, cuts and timing**. Only your assets change.

Rendering is deterministic code ([Remotion](https://remotion.dev)), not generative video, so the cuts and motion are reproduced exactly every time.

## How it works

```
reference.mp4
  │  ffprobe                → fps, size, duration, audio
  │  ffmpeg scene detection → hard cuts → shots (long shots split into ≤6 s windows)
  │  frame sampling (~12/s) → labeled contact sheets + full-res stills per shot
  ▼
Claude (claude-opus-5-5, vision, structured output) per shot, in parallel
  → layers, keyframed tracks, easing, text animation, transitions, slot candidates
  ▼
Claude merge pass
  → unify slots across shots (same logo everywhere = one slot), normalize fonts,
    write the Motion Prompt (markdown)
  ▼
Refinement loop (optional, 0–3 passes)
  render spec → per-frame SSIM vs. original → send worst shots (original vs. render
  side by side) back to Claude for correction → keep the best version of each shot
  ▼
spec.json + motion-prompt.md
  ▼
User swaps assets (web UI or values.json) → Remotion renders output.mp4
```

One generic Remotion composition ([src/remotion/SpecVideo.tsx](src/remotion/SpecVideo.tsx)) interprets any MotionSpec, so Claude never writes code that gets executed.

## Setup

Requirements: Node 20+. ffmpeg and ffprobe come from npm (`ffmpeg-static`, `ffprobe-static`). Remotion downloads its own headless Chrome on the first render.

```bash
npm install
cp .env.example .env.local     # only for the API pipeline: set ANTHROPIC_API_KEY (the Claude Code skill needs no key)
```

## Use it

### Web app

```bash
npm run dev        # http://localhost:3000
```

1. Drop a reference video on the home page. Pick how many accuracy passes to run.
2. Watch the analysis progress. When it finishes you get a live preview (Remotion Player).
3. On the **Assets** tab, upload a logo or images, replace footage, edit text, pick colors. The preview updates instantly. Turn on *show slots* to see what each slot controls, or *compare with original* to check accuracy.
4. **Motion prompt** tab: copy or download the Claude Motion Prompt.
5. **JSON** tab: hand-tune any timing, position or easing.
6. **Render video**, then download the MP4.

### CLI

```bash
# Analyze (creates storage/jobs/<id>/spec.json + motion-prompt.md)
npm run analyze -- path/to/reference.mp4 --refine 1
npm run analyze -- path/to/reference.mp4 --dry      # cuts + contact sheets only, no Claude calls

# Render with your assets
npm run render -- <jobId> my-values.json
```

`my-values.json` maps slot ids (see `spec.json → slots`) to replacements. Local file paths are copied into the job:

```json
{
  "logo":        { "src": "C:/brand/logo.png" },
  "product_1":   { "src": "C:/brand/hero.mp4" },
  "headline":    { "text": "Launch Day" },
  "brand_color": { "color": "#00c2ff" }
}
```

Other scripts: `npm run studio` opens Remotion Studio on the sample spec. `npm run sample` renders the sample spec to `storage/sample/`.

## MotionSpec

Defined with zod in [src/spec/schema.ts](src/spec/schema.ts). The main conventions:

- Geometry is normalized: `x`/`y` is the layer **center** as a fraction of frame width and height. `width`/`height` are fractions. `fontSize` is a fraction of frame height.
- Keyframe `frame` is relative to the shot start. A key's `easing` applies to the segment *arriving* at it. There are 15 named curves plus `custom` cubic-bezier.
- Animatable props: `x y width height scale scaleX scaleY rotation opacity blur clipLeft clipRight clipTop clipBottom`. The `clip*` props are used for masks, wipes and reveals.
- `textAnim` staggers chars, words or lines from a `from` state (opacity, offset, scale, rotation, blur).
- Each shot has a background (solid, linear or radial gradient), camera tracks (pan, zoom, rotate) and a `transitionIn` (cut, fade, slide, wipe, zoom, blur).
- Slots have a kind of `image`, `video`, `text` or `color`. Defaults are cropped from the reference. Default footage plays the original video's matching region and timing.
- Longer replacement text shrinks to fit the original text box.

## Project layout

```
src/spec/        schema, easing (pure cubic-bezier), keyframe interpolation, sanitizer, slot resolution
src/pipeline/    probe, scene detection, frames/contact sheets, crops, SSIM, per-shot analysis,
                 merge, refine loop, runAnalysis / runRender orchestrators
src/claude/      SDK wrapper (streaming, adaptive thinking, structured output, refusal fallback), prompts
src/remotion/    SpecVideo interpreter, layer renderers, transitions, Google Fonts loader, sample spec
src/render/      bundle + renderMedia, local asset server
src/jobs/        file-based job store (storage/jobs/<id>/) + in-process queue
src/app/         Next.js UI and API routes
scripts/         analyze / render / render-sample CLIs
```

## Limits

- Best on 2D motion graphics: kinetic type, logo reveals, shape animation, slideshows, UI promos. Complex 3D, particles and organic camera footage are not rebuilt from primitives. They become **video slots** that play the original region, or your replacement clip.
- Fonts are matched to the closest Google Font.
- Soft transitions are not detected as cuts. Those windows are modeled with layers inside one shot.
- Cost scales with shot count. Each shot is one vision call, plus one merge call, plus up to 4 shot calls per refinement pass. Claude Opus 5.5 is $4 / $20 per million input/output tokens.
- Jobs run one at a time per server process. Storage is the local `storage/` folder.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | Claude credentials (or an `ant auth login` profile) |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for analysis, merge and refine |
| `CLAUDE_EFFORT` | `high` | `low`/`medium`/`high`/`xhigh`/`max` |
| `STORAGE_DIR` | `./storage` | Where jobs are stored |
| `FFMPEG_PATH`, `FFPROBE_PATH` | npm binaries | Use system ffmpeg instead |

## Claude Code skill (no API key)

Open this folder in [Claude Code](https://claude.com/claude-code) and run `/cmkatana`. It works on a normal Claude subscription: **Claude Code itself does the vision analysis**, so you don't need an `ANTHROPIC_API_KEY`.

1. A local upload box opens in your browser. Drop the reference video.
2. `npm run skill -- prepare` finds the cuts and builds labeled contact sheets plus one task file per shot. Claude Code reads the frames and writes each shot as MotionSpec JSON (one subagent per shot for longer videos). `breakdown` validates it against the schema.
3. Claude Code unifies the slots and writes the Motion Prompt. `assemble` builds `spec.json`.
4. Accuracy passes: `refine` renders the spec and scores it against the original with SSIM. Claude Code looks at original-versus-render comparison sheets and corrects the weak shots. `finish` keeps each shot's best version.
5. An asset upload page opens with one card per slot (logo, images, footage, text, colors). Then `npm run render` writes the MP4.

All of these steps are local scripts ([scripts/skill.ts](scripts/skill.ts), [scripts/upload.ts](scripts/upload.ts)). You can also open the pages by hand with `npm run upload -- video` and `npm run upload -- assets <jobId>`.

The **API pipeline** (`npm run analyze`, and the web app's analyze button) does the same analysis with direct Claude API calls in parallel. It needs `ANTHROPIC_API_KEY` and suits batch or unattended use.

## License

[MIT](LICENSE)
