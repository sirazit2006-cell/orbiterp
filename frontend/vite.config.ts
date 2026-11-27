import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Laravel API runs on :8000 in development (php artisan serve).
const api = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: api, changeOrigin: true } },
  },
})
