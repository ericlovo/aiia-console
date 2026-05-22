import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest config separate from vite.config.ts so the Tauri dev server config
// (port 1420, strict, HMR) doesn't leak into test runs.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.d.ts",
        "src/test/**",
        "src/_legacy/**",
        "src/main.tsx",
        "src/vite-env.d.ts",
      ],
    },
  },
});
