import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the React app proxies /api to Django, so both share one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": process.env.VITE_API_PROXY ?? "http://localhost:8000",
    },
  },
});
