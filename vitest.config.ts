import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["orchestrator/**", "cli/**", "git/**", "schemas/**/*.ts"],
      exclude: ["tests/**", "scripts/**", "dist/**"],
    },
  },
});
