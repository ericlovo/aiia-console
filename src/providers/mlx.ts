// MLX provider — stub. Will eventually wrap a local MLX/mlx-lm HTTP server
// running on macOS. Not wired into the registry yet.
//
// TODO(mlx): implement listModels() via an mlx-server `/models` endpoint and
// stream() using whatever streaming format mlx-server exposes (likely
// OpenAI-compatible SSE).

import type {
  ModelInfo,
  Provider,
  ProviderInfo,
  StreamChunk,
  StreamOptions,
} from "./types";

export class MlxProvider implements Provider {
  info: ProviderInfo = {
    id: "mlx",
    label: "MLX (local, stub)",
    kind: "local",
  };

  async listModels(): Promise<ModelInfo[]> {
    return [];
  }

  // eslint-disable-next-line require-yield
  async *stream(_opts: StreamOptions): AsyncIterable<StreamChunk> {
    throw new Error("MLX provider not implemented yet");
  }
}
