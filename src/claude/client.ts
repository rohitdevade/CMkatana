import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORT = (process.env.CLAUDE_EFFORT as Effort | undefined) || "high";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Credentials resolve from ANTHROPIC_API_KEY or an `ant auth login` profile.
  client ??= new Anthropic({ maxRetries: 4 });
  return client;
}

type ContentBlock = Anthropic.Beta.BetaContentBlockParam;

export function imageBlock(file: string): ContentBlock {
  const ext = path.extname(file).toLowerCase();
  const media_type = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  return { type: "image", source: { type: "base64", media_type, data: fs.readFileSync(file).toString("base64") } };
}

export const textBlock = (text: string): ContentBlock => ({ type: "text", text });

export class ClaudeOutputError extends Error {}

/**
 * One structured-output call: streams (long outputs), adaptive thinking, server-side refusal
 * fallback, caches the (stable) system prompt, and validates the JSON against `schema`.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  content: ContentBlock[];
  label: string;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: opts.effort ?? EFFORT, format: betaZodOutputFormat(opts.schema) },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.content }],
    });
    const msg = await stream.finalMessage();

    if (msg.stop_reason === "refusal") {
      throw new ClaudeOutputError(`[${opts.label}] request declined: ${msg.stop_details?.explanation ?? "no details"}`);
    }
    if (msg.stop_reason === "max_tokens") {
      lastError = new ClaudeOutputError(`[${opts.label}] output truncated at max_tokens`);
      continue;
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      const parsed = opts.schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
      lastError = new ClaudeOutputError(`[${opts.label}] schema validation failed: ${parsed.error.message.slice(0, 1000)}`);
    } catch (err) {
      lastError = new ClaudeOutputError(`[${opts.label}] invalid JSON: ${(err as Error).message}`);
    }
  }
  throw lastError;
}
