import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { environment: "node", include: ["lib/citas/**/*.test.ts", "lib/chatwoot-account.test.ts", "lib/dashboard-navigation.test.ts", "lib/psychology.test.ts"] },
});
