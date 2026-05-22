// distill — turn a raw transcript into a structured journal markdown note.
//
// Uses the existing provider streaming abstraction so we can route to whichever
// chat provider is configured (Groq → Anthropic → OpenAI → Google → others).
// The system prompt is journaling-specific: prose-forward, first person,
// reads like a continuation of the speaker's voice rather than a meeting
// summary.

import type { ProviderId } from "../providers/types";
import { getProvider } from "../providers";

export interface DistillInput {
  transcript: string;
  durationSeconds: number;
  startedAt: Date;
  transcriptionProvider: string;
}

export interface DistillOpts {
  provider: ProviderId;
  model: string;
  signal?: AbortSignal;
  /** Called with each streamed delta; useful for live UI updates. */
  onDelta?: (delta: string) => void;
}

/** Provider+model combos that work well for distillation (fast, prose-good). */
export const DISTILL_DEFAULTS: Partial<Record<ProviderId, string>> = {
  groq: "llama-3.3-70b-versatile",
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-5-mini",
  google: "gemini-2.5-flash",
  deepseek: "deepseek-chat",
  moonshot: "moonshot-v1-32k",
};

/**
 * Pick the first provider that has DISTILL_DEFAULTS coverage AND is currently
 * configured (`configured` is a presence map, e.g. keystore_get_keys result).
 * Returns null if nothing's available — caller should save the raw transcript
 * and surface a settings hint.
 */
export function pickDistillProvider(
  configured: Record<string, boolean>,
): { provider: ProviderId; model: string } | null {
  const order: ProviderId[] = [
    "groq",
    "anthropic",
    "openai",
    "google",
    "deepseek",
    "moonshot",
  ];
  for (const p of order) {
    if (configured[p] && DISTILL_DEFAULTS[p]) {
      return { provider: p, model: DISTILL_DEFAULTS[p]! };
    }
  }
  return null;
}

function systemPrompt(input: DistillInput): string {
  return [
    "You are a thoughtful journaling partner.",
    "The user just finished speaking aloud in a journaling session.",
    "Your job is to distill the raw transcript into a Markdown note they",
    "will read back later — something that feels personal, captures what",
    "they're actually working through, and reads as a continuation of",
    "their voice rather than a meeting summary.",
    "",
    "Output ONLY the markdown, no preamble. Begin with YAML frontmatter,",
    "then the body. Use serif-friendly prose, not bullet-lists-everywhere",
    "style. If a section has nothing to say, OMIT it — do not write",
    "placeholder bullets.",
    "",
    "Required frontmatter keys (use these exact values, do not invent):",
    `  date: ${input.startedAt.toISOString().slice(0, 10)}`,
    `  started: ${input.startedAt.toISOString()}`,
    `  duration_seconds: ${input.durationSeconds}`,
    `  transcription: ${input.transcriptionProvider}`,
    `  aiia_managed: true`,
    `  tags: [journal, session]`,
    "",
    "Body structure (markdown headings):",
    "  # {Title — 4-7 words capturing the essence; no period}",
    "  {2-3 sentence opening that sets the scene}",
    "  ## What I'm working through",
    "  {2-4 paragraphs of prose, first person.}",
    "  ## Threads",
    "  - {3-7 bullets, each one line, naming a topic the session touched}",
    "  ## Decisions",
    "  - {only if decisions were actually made}",
    "  ## Open questions",
    "  - {1-3 questions still unresolved that deserve coming back to}",
  ].join("\n");
}

function userPrompt(transcript: string): string {
  return `Raw transcript follows. Distill it.\n\n---\n${transcript}\n---`;
}

export async function distill(
  input: DistillInput,
  opts: DistillOpts,
): Promise<string> {
  const provider = getProvider(opts.provider);
  const messages = [
    { role: "system" as const, content: systemPrompt(input) },
    { role: "user" as const, content: userPrompt(input.transcript) },
  ];
  let full = "";
  for await (const chunk of provider.stream({
    model: opts.model,
    messages,
    signal: opts.signal,
  })) {
    if (chunk.delta) {
      full += chunk.delta;
      opts.onDelta?.(chunk.delta);
    }
    if (chunk.done) break;
  }
  return full;
}
