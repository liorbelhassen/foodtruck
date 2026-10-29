import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}", "functions/**/*.test.js"],
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
