// whisper — transcribe an audio Blob via the Rust-side keystore_transcribe
// command. The Rust side signs the multipart upload with the stored API key
// so the JS layer never sees the plaintext key. Currently only Groq is wired
// (whisper-large-v3-turbo); OpenAI Whisper is one match-arm away.

import { invoke } from "@tauri-apps/api/core";

export interface TranscribeOpts {
  provider: "groq";
  model?: string;
  language?: string;
}

const DEFAULT_MODELS: Record<TranscribeOpts["provider"], string> = {
  groq: "whisper-large-v3-turbo",
};

/**
 * Encode the blob's bytes as standard-alphabet base64. The Rust IPC channel
 * can't carry raw binary (it serializes via JSON), so we shuttle bytes as
 * base64. For a typical 5-minute journaling session this is ~4MB of base64;
 * negligible IPC cost on a Mac mini.
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // Chunked to avoid call-stack overflow on large blobs.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

export async function transcribe(
  blob: Blob,
  opts: TranscribeOpts,
): Promise<string> {
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];
  const audioBase64 = await blobToBase64(blob);
  // MediaRecorder may give us a parametrized mime like "audio/webm;codecs=opus".
  // Strip parameters — Groq's multipart parser is happier with the base type.
  const contentType = (blob.type || "audio/webm").split(";")[0];
  return invoke<string>("keystore_transcribe", {
    args: {
      provider: opts.provider,
      model,
      audio_base64: audioBase64,
      content_type: contentType,
      language: opts.language ?? null,
    },
  });
}
