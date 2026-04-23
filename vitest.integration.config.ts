import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["server/tests/integration/**/*.test.ts"],
      exclude: ["node_modules", "dist", ".cache"],
      testTimeout: 30000,
    },
  }),
);
