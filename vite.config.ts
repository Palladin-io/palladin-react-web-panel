/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite(),
    react(),
    tailwindcss(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    env: {
      VITE_API_URL: 'http://localhost:5000',
      VITE_GOOGLE_CLIENT_ID: 'test-client-id',
      VITE_SIGNALR_HUB_URL: 'http://localhost:5000/hubs/notifications',
    },
  },
})
