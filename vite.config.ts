import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const securityHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff"
};

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.wasm"],
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true
  },
  server: {
    headers: securityHeaders
  },
  preview: {
    headers: securityHeaders
  }
});
