import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: "lab",
  publicDir: false,
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src"),
    },
  },
});
