import { ffprobe } from "./ffmpeg";

export type VideoInfo = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  durationInFrames: number;
  hasAudio: boolean;
};

function parseRate(rate: string | undefined): number {
  if (!rate) return 0;
  const [n, d] = rate.split("/").map(Number);
  return d ? n / d : n;
}

export async function probe(file: string): Promise<VideoInfo> {
  const { stdout } = await ffprobe(["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]);
  const data = JSON.parse(stdout) as {
    streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; nb_frames?: string; duration?: string; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
    format: { duration?: string };
  };
  const v = data.streams.find((s) => s.codec_type === "video");
  if (!v || !v.width || !v.height) throw new Error("No video stream found");

  let fps = parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30;
  // Snap near-standard rates (29.97 → 29.97 stays, 30.0003 → 30).
  const rounded = Math.round(fps);
  if (Math.abs(fps - rounded) < 0.01) fps = rounded;

  const durationSec = Number(v.duration ?? data.format.duration ?? 0);
  const nb = Number(v.nb_frames ?? 0);
  const durationInFrames = nb > 0 ? nb : Math.round(durationSec * fps);

  // Phone footage may be stored rotated; report display dimensions.
  const rot = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((s) => s.rotation !== undefined)?.rotation ?? 0));
  const swap = rot === 90 || rot === 270;

  return {
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps,
    durationSec,
    durationInFrames,
    hasAudio: data.streams.some((s) => s.codec_type === "audio"),
  };
}
