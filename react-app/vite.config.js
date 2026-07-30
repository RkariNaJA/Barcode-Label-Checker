import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/* `npm run build`        → dist/         (static files for a web server)
   `npm run build:single` → dist-single/  (one self-contained compare.html) */
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: "./",
    server: { host: '0.0.0.0', port: 5175 },
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    build: {
      outDir: single ? "dist-single" : "dist",
      chunkSizeWarningLimit: 3000,
    },
  };
});
