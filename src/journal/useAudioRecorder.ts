// useAudioRecorder — thin React hook around the browser's MediaRecorder API.
//
// The first call to `start()` triggers the macOS microphone permission
// prompt (driven by NSMicrophoneUsageDescription in src-tauri/Info.plist).
// Once granted the permission persists; subsequent sessions start silently.
//
// The hook owns nothing the recorder doesn't already own. When the consumer
// component unmounts mid-session the cleanup effect stops the recorder and
// releases the media tracks, so the macOS recording indicator goes away.

import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "recording" | "stopping";

interface AudioRecorderHook {
  state: State;
  error: string | null;
  /** Resolves once the mic stream + recorder are running, or rejects. */
  start: () => Promise<void>;
  /** Resolves with the final encoded audio blob + mime type. */
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
  /** Last recorded blob, exposed for re-play / inspect. */
  lastBlob: Blob | null;
}

function pickMimeType(): string {
  // Tauri ships WebKit on macOS; "audio/webm" works in Chromium webviews and
  // newer WebKit. "audio/mp4" is the WebKit-native preferred container. We
  // probe in order and fall back to the empty string (browser's default).
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  if (typeof MediaRecorder === "undefined") return "";
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

export function useAudioRecorder(): AudioRecorderHook {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopResolveRef = useRef<((value: { blob: Blob; mimeType: string }) => void) | null>(null);

  const cleanup = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        // best-effort
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    chunksRef.current = [];
  }, []);

  // Component unmount → release the mic.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    if (state !== "idle") return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("microphone unavailable in this environment");
      throw new Error("no mediaDevices");
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`microphone permission denied: ${msg}`);
      throw e;
    }
    streamRef.current = stream;

    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch (e) {
      // Clean up the stream we just acquired before re-raising.
      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      setError(`MediaRecorder failed: ${msg}`);
      throw e;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const finalType = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: finalType });
      setLastBlob(blob);
      // Release mic tracks immediately so the macOS indicator clears.
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
      const r = stopResolveRef.current;
      stopResolveRef.current = null;
      setState("idle");
      if (r) r({ blob, mimeType: finalType });
    };
    recorder.onerror = (ev) => {
      // Surface as state; consumers will see the error after stop().
      const ee = ev as unknown as { error?: { message?: string } };
      const msg = ee?.error?.message ?? "MediaRecorder error";
      setError(msg);
    };

    // 250ms timeslice means chunks arrive periodically — keeps memory bounded
    // for long sessions and gives us interim data if the app is killed.
    recorder.start(250);
    setState("recording");
  }, [state]);

  const stop = useCallback((): Promise<{ blob: Blob; mimeType: string }> => {
    if (state !== "recording" || !recorderRef.current) {
      return Promise.reject(new Error("not recording"));
    }
    setState("stopping");
    return new Promise((resolve) => {
      stopResolveRef.current = resolve;
      recorderRef.current!.stop();
    });
  }, [state]);

  return { state, error, start, stop, lastBlob };
}
