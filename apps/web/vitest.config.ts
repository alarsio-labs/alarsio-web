import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // The automatic JSX runtime, as Next uses, so a test can render a .tsx component.
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.test.ts"], environment: "node" }
});
