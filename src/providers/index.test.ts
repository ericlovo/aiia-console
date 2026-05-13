import { describe, it, expect } from "vitest";

import {
  parseProviderModelId,
  formatProviderModelId,
  normalizeProviderModelId,
} from "./index";

describe("parseProviderModelId", () => {
  it("splits provider and model on the first colon", () => {
    expect(parseProviderModelId("anthropic:claude-opus-4-7")).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-7",
    });
  });

  it("preserves colons in the model half (ollama tags)", () => {
    // Ollama model tags themselves contain colons, e.g. "qwen3:14b".
    // Only the FIRST colon separates provider from model.
    expect(parseProviderModelId("ollama:qwen3:14b")).toEqual({
      provider: "ollama",
      model: "qwen3:14b",
    });
  });

  it("treats a bare string with no colon as an ollama model", () => {
    expect(parseProviderModelId("llama3.2")).toEqual({
      provider: "ollama",
      model: "llama3.2",
    });
  });
});

describe("formatProviderModelId", () => {
  it("joins provider and model with a colon", () => {
    expect(
      formatProviderModelId({ provider: "openai", model: "gpt-5" }),
    ).toBe("openai:gpt-5");
  });

  it("round-trips with parseProviderModelId", () => {
    const id = "anthropic:claude-opus-4-7";
    expect(formatProviderModelId(parseProviderModelId(id))).toBe(id);
  });
});

describe("normalizeProviderModelId", () => {
  it("returns null for empty input", () => {
    expect(normalizeProviderModelId(undefined)).toBeNull();
    expect(normalizeProviderModelId("")).toBeNull();
  });

  it("namespaces a bare model name under ollama:", () => {
    expect(normalizeProviderModelId("llama3.2")).toBe("ollama:llama3.2");
  });

  it("passes through an already-namespaced id unchanged", () => {
    expect(normalizeProviderModelId("anthropic:claude-opus-4-7")).toBe(
      "anthropic:claude-opus-4-7",
    );
  });

  it("preserves multi-colon ollama tags", () => {
    expect(normalizeProviderModelId("ollama:qwen3:14b")).toBe(
      "ollama:qwen3:14b",
    );
  });
});
