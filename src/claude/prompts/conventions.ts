/** Shared description of the MotionSpec coordinate system. Kept byte-stable so the system prompt caches. */
export const SPEC_CONVENTIONS = `
## MotionSpec conventions (the renderer interprets these literally)

Geometry
- x, y = the CENTER of the layer as a fraction of frame width / height (0..1; may go outside for off-screen positions).
- width, height = fraction of frame width / height. For text, width is the text box width (roughly the rendered line width), height is the line box height.
- scale multiplies size uniformly; scaleX / scaleY multiply on top of it (use scaleX 0→1 for bars that "grow" from their center).
- rotation in degrees clockwise. opacity 0..1. blur in pixels at the source resolution.
- clipLeft/clipRight/clipTop/clipBottom = fraction (0..1) of the layer hidden from that side. Use them for masks, wipes and text reveals (e.g. clipRight 1→0 reveals left-to-right).
- Typography: fontSize is a fraction of frame HEIGHT (cap-height-to-descender line box, e.g. a line that is 10% of frame height ≈ 0.1). letterSpacing in em. fontFamily must be the closest Google Font family name (e.g. "Montserrat", "Inter", "Bebas Neue", "Playfair Display", "Poppins", "Anton", "Space Grotesk").

Time
- All frames are relative to the start of the shot (frame 0 = first frame of the shot). Use the "f" numbers printed on each tile.
- base = the layer's resting transform. tracks override base properties over time.
- A keyframe's easing describes the segment ARRIVING at that keyframe from the previous one. The first keyframe's easing is ignored (use "linear").
- Values hold before the first and after the last keyframe, so put a keyframe at the moment motion starts and at the moment it settles.
- Choose easing by the feel of the motion: snappy decelerations are easeOutExpo/easeOutQuart; overshoot is easeOutBack; accelerating exits are easeInExpo/easeInCubic; smooth drifts are linear or easeInOut. Use "custom" with a bezier only when no preset matches.
- inFrame/outFrame bound visibility (outFrame exclusive). Fades still need opacity tracks.

Text animation
- textAnim animates units (char/word/line) one after another: each unit goes from the "from" state to its resting state over durationFrames, starting at startFrame + index*staggerFrames. offsetX/offsetY are fractions of frame width/height. Use it for typewriter, per-letter pop, word cascades, line slides. Whole-block motion goes in tracks instead.

Layers
- type text: put the literal text in "text" (exact wording, line breaks as \\n, original casing — use textTransform for forced uppercase only when the casing is a style).
- type image: logos, photos, product shots, icons, illustrations — anything a user would swap for their own asset.
- type video: live-action / complex footage regions that cannot be rebuilt from primitives (3D, particles, photography in motion).
- type shape: solid rectangles, pills, circles, lines, underlines, color blocks, frames. Gradients belong in the shot background.
- z: higher draws on top. Give every layer a stable short id unique within the shot.
- Unused nullable fields must be null (e.g. style/textAnim are null for non-text layers, shape is null for non-shapes).

Camera
- camera tracks move the whole shot: x/y are pan OFFSETS (fraction of frame, 0 = no pan), scale is zoom (1 = none), rotation in degrees.

Transitions
- transitionIn describes how this shot enters over the previous one. Hard cut = {"kind":"cut","durationInFrames":0}.
`.trim();
