import { defineConfig } from "vitest/config";

const secret = "test-jwt-secret-must-be-32-characters-min";
const pepper = "test-pin-pepper-must-be-32-characters-min";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 60_000,
    env: {
      JWT_SECRET: secret,
      PIN_PEPPER: pepper,
      NODE_ENV: "test",
    },
  },
});
