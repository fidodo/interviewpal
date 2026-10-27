import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The kids Python runner is a module worker that dynamically imports Pyodide from the CDN.
  worker: { format: "es" },
  // Blockly (kids blocks editor) is ~720 kB on its own; it is already isolated in a lazy chunk.
  build: { chunkSizeWarningLimit: 800 },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
