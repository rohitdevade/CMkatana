import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const FFMPEG = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string);
export const FFPROBE = process.env.FFPROBE_PATH || ffprobeStatic.path;

export type RunResult = { stdout: string; stderr: string };

export function run(bin: string, args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin} exited with ${code}\n${stderr.slice(-2000)}`));
    });
  });
}

export const ffmpeg = (args: string[]) => run(FFMPEG, ["-hide_banner", "-y", ...args]);
export const ffprobe = (args: string[]) => run(FFPROBE, args);
