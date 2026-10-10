import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / bundler-heavy packages must stay out of the Next.js server bundle.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "esbuild",
    "sharp",
    "ffmpeg-static",
    "ffprobe-static",
  ],
};

export default nextConfig;
