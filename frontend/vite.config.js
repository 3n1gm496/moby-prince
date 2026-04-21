import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  // Expose VITE_API_KEY (and any other VITE_* vars) to the browser bundle.
  // Set in .env or as a build-time environment variable:  VITE_API_KEY=<key>
  envPrefix: "VITE_",
});
