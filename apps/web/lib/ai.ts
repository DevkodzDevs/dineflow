import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";   // the SDK helper is typed against v4; zod 3.25 ships it under this path

/**
 * One door to the model for every screen that wants a suggestion.
 *
 * Every feature built on this is a *suggestion*: it fills a form, drafts a reply, proposes a mapping,
 * and a person presses Save. Nothing here writes to the database. That is the whole design — a model
 * that can be wrong is fine as long as it is never the last hand on the till.
 *
 * Without ANTHROPIC_API_KEY on the server, aiEnabled() is false, the screens hide their buttons, and
 * the app is exactly what it was before. A missing key is a feature that is off, not an error.
 *
 * The model is Claude Opus 5 with adaptive thinking (its default) at a low effort: every job here is a
 * short structured answer over a small amount of context — a recipe, a reply, a dozen names to match —
 * and low effort on this model answers those well at a fraction of the tokens and latency. Structured
 * output is enforced by the API against a Zod schema, so the screens never parse prose.
 *
 * `fallbacks: "default"` is on: Opus 5's safety classifiers can decline a request, and with this set
 * the API re-runs a declined request on Anthropic's recommended substitute inside the same call rather
 * than handing the screen a refusal to deal with. Nothing in a kitchen should ever trip it, but a
 * screen that has to explain a policy refusal to a waiter is a screen that will do it badly.
 */

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MODEL = "claude-opus-5";

let _client: Anthropic | null = null;
const client = () => (_client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 }));

export type AskResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Ask for one structured answer. `system` is the standing brief for this job (stable, so it caches);
 * `user` is the facts for this call. Returns the parsed object or a short, showable reason.
 */
export async function askJson<S extends z.ZodTypeAny>(opts: {
  schema: S;
  system: string;
  user: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<AskResult<z.infer<S>>> {
  if (!aiEnabled()) return { ok: false, error: "AI is switched off on this server — add ANTHROPIC_API_KEY to turn it on." };
  try {
    const res = await client().beta.messages.create({
      model: MODEL,
      max_tokens: opts.maxTokens ?? 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: opts.effort ?? "low", format: zodOutputFormat(opts.schema) },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
    });
    // Branch on stop_reason before touching content: a refusal can arrive with an empty body.
    if (res.stop_reason === "refusal") return { ok: false, error: "The model declined this one. Fill it in by hand." };
    if (res.stop_reason === "max_tokens") return { ok: false, error: "The answer ran too long to finish. Try again." };
    const text = res.content.find((b) => b.type === "text")?.text;
    if (!text) return { ok: false, error: "The model sent nothing back. Try again." };
    const parsed = opts.schema.safeParse(JSON.parse(text));
    if (!parsed.success) return { ok: false, error: "The model's answer did not fit the form. Try again." };
    return { ok: true, data: parsed.data };
  } catch (e) {
    // most specific first, so a rate limit reads as "busy" and a bad key reads as "bad key"
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic key on this server is not valid." };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, error: "The model is busy right now — try again in a moment." };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, error: "Could not reach the model. Check the server's connection." };
    if (e instanceof Anthropic.APIError) return { ok: false, error: `The model returned an error (${e.status}).` };
    if (e instanceof SyntaxError) return { ok: false, error: "The model's answer was not readable. Try again." };
    return { ok: false, error: "Something went wrong asking the model." };
  }
}

/** The house style every drafted sentence follows. Kept in one place so the app sounds like one voice. */
export const VOICE = `Write in plain, warm, everyday Indian English. Short sentences. No exclamation marks, no emojis, no marketing words like "delight", "exquisite", "indulge", "elevate". Sound like a proprietor who was there, not a brand.`;
