import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  server: {
    port: 5001,
  },
  preview: {
    port: 5001,
  },
  build: {
    outDir: "dist",
  },
});
