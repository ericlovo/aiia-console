// vault — write a journal entry to the Obsidian vault via the Rust-side
// vault_write Tauri command. Filenames are time-stamped and live under
// 00-Inbox/ to match the convention from local_brain/vault_paths.py.

import { invoke } from "@tauri-apps/api/core";

export interface WriteResult {
  /** Absolute path that the file actually landed at (returned by Rust). */
  path: string;
  /** Vault-relative path passed to the command. */
  relativePath: string;
}

/**
 * Generate a vault-relative filename for the given session start time.
 * Pattern: 00-Inbox/YYYY-MM-DD-HHMMSS-session.md. Stable enough to sort
 * lexically by chronology, friendly enough to read at a glance.
 */
export function sessionFilename(startedAt: Date): string {
  const yyyy = startedAt.getFullYear();
  const mm = String(startedAt.getMonth() + 1).padStart(2, "0");
  const dd = String(startedAt.getDate()).padStart(2, "0");
  const hh = String(startedAt.getHours()).padStart(2, "0");
  const min = String(startedAt.getMinutes()).padStart(2, "0");
  const ss = String(startedAt.getSeconds()).padStart(2, "0");
  return `00-Inbox/${yyyy}-${mm}-${dd}-${hh}${min}${ss}-session.md`;
}

export async function writeSessionFile(
  relativePath: string,
  content: string,
): Promise<WriteResult> {
  const path = await invoke<string>("vault_write", {
    path: relativePath,
    content,
    mode: "overwrite",
    section: null,
  });
  return { path, relativePath };
}

/**
 * Emergency-save format used when the LLM distillation fails or no
 * distillation provider is configured. Captures the raw transcript with
 * minimal frontmatter so the session is never lost.
 */
export function fallbackMarkdown(input: {
  transcript: string;
  startedAt: Date;
  durationSeconds: number;
  transcriptionProvider: string;
}): string {
  const fm = [
    "---",
    `date: ${input.startedAt.toISOString().slice(0, 10)}`,
    `started: ${input.startedAt.toISOString()}`,
    `duration_seconds: ${input.durationSeconds}`,
    `transcription: ${input.transcriptionProvider}`,
    `aiia_managed: true`,
    `tags: [journal, session, raw]`,
    "---",
    "",
  ].join("\n");
  return `${fm}# Session ${input.startedAt.toISOString().slice(0, 16).replace("T", " ")}\n\n*(distillation skipped — raw transcript below)*\n\n${input.transcript}\n`;
}
