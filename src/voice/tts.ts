// AIIA voice — speaks replies aloud using the webview's built-in Web Speech
// synthesis (SpeechSynthesis). No brain call, no API key, works offline and
// on every surface. We prefer a female English system voice so Aya has a
// consistent voice across machines.

const FEMALE_HINTS = [
  "samantha", "victoria", "karen", "moira", "tessa", "fiona", "ava",
  "allison", "susan", "zoe", "serena", "kate", "female",
];

let cached: SpeechSynthesisVoice | null = null;

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function pickAiiaVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  if (cached) return cached;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null; // not loaded yet — caller retries on voiceschanged
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = en.length ? en : voices;
  cached =
    pool.find((v) => FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h))) ??
    pool.find((v) => v.lang.toLowerCase().startsWith("en-us")) ??
    pool[0] ??
    null;
  return cached;
}

// Warm the voice list (getVoices() is empty until the engine loads them).
export function primeVoices(): void {
  if (!ttsSupported()) return;
  pickAiiaVoice();
  window.speechSynthesis.onvoiceschanged = () => {
    cached = null;
    pickAiiaVoice();
  };
}

// Strip markdown so the voice doesn't read asterisks, fences, links, etc.
export function stripForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>~]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cancelSpeech(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

// Speak text in Aya's voice. onEnd fires when speech finishes or is cancelled.
export function speak(text: string, onEnd?: () => void): void {
  if (!ttsSupported()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(stripForSpeech(text));
  const voice = pickAiiaVoice();
  if (voice) utt.voice = voice;
  utt.rate = 1.02;
  utt.pitch = 1.05;
  utt.onend = () => onEnd?.();
  utt.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utt);
}
