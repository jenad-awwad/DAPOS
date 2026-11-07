import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // The phone reaches this laptop through USB on 127.0.0.1.
    // "localhost" is IPv6 on the phone and misses that forward.
    hmr: {
      host: "127.0.0.1",
      port: 5173,
      clientPort: 5173,
    },
  },
})
