import { z } from "zod";
import { BackgroundSchema, LayerSchema, SLOT_KINDS, TrackSchema, TransitionSchema } from "../spec/schema";

export const SlotCandidateSchema = z.object({
  id: z.string().describe("snake_case, unique within the shot; layers reference it via slotId"),
  kind: z.enum(SLOT_KINDS),
  label: z.string(),
  description: z.string(),
  text: z.string().nullable().describe("Exact text for text slots"),
  color: z.string().nullable().describe("Hex color for color slots"),
  frame: z.number().describe("Shot-relative frame where the asset is fully visible and at rest"),
  box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).describe("Normalized center-based box at that frame"),
});
export type SlotCandidate = z.infer<typeof SlotCandidateSchema>;

export const ShotAnalysisSchema = z.object({
  description: z.string(),
  background: BackgroundSchema,
  transitionIn: TransitionSchema,
  camera: z.array(TrackSchema),
  layers: z.array(LayerSchema),
  slotCandidates: z.array(SlotCandidateSchema),
});
export type ShotAnalysis = z.infer<typeof ShotAnalysisSchema>;

export const MergeResultSchema = z.object({
  title: z.string(),
  fonts: z.array(z.string()),
  palette: z.array(z.string()),
  fontMap: z.array(z.object({ from: z.string(), to: z.string() })),
  slots: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(SLOT_KINDS),
      label: z.string(),
      description: z.string(),
      members: z.array(z.object({ shotId: z.string(), candidateId: z.string() })),
    }),
  ),
  motionPrompt: z.string().describe("Markdown"),
});
export type MergeResult = z.infer<typeof MergeResultSchema>;

export const RefineResultSchema = z.object({
  notes: z.string().describe("What was wrong and what changed"),
  background: BackgroundSchema,
  transitionIn: TransitionSchema,
  camera: z.array(TrackSchema),
  layers: z.array(LayerSchema),
});
export type RefineResult = z.infer<typeof RefineResultSchema>;
