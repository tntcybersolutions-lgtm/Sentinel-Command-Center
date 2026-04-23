import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: [
      "node_modules",
      "dist",
      ".cache",
      "attached_assets",
      "server/data",
      "server/tests/integration/**",
    ],
    environment: "node",
    env: {
      DATABASE_URL: "postgres://fake:fake@localhost:5432/fake_unit_tests",
    },
    globals: false,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
});
