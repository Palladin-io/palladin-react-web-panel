/// <reference types="vitest/config" />
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

const publicAssetOriginPlaceholder = '__PALLADIN_PUBLIC_ASSET_ORIGIN__'

function publicAssetOrigin(value: string | undefined, apiUrl: string | undefined): string {
  const configured = value?.trim() || (apiUrl?.startsWith('http://localhost:')
    ? 'http://localhost:4566/palladin-local-public-assets'
    : 'https://assets.palladin.io')
  const url = new URL(configured)
  const localHttp = url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password) {
    throw new Error('VITE_PUBLIC_ASSET_URL must use HTTPS (or loopback HTTP) and contain no credentials')
  }
  return url.origin
}

function injectPublicAssetCsp(origin: string): Plugin {
  return {
    name: 'inject-public-asset-csp',
    apply: 'build',
    async writeBundle(options) {
      const headersPath = resolve(options.dir ?? 'dist', '_headers')
      const headers = await readFile(headersPath, 'utf8')
      if (!headers.includes(publicAssetOriginPlaceholder)) {
        throw new Error(`Missing ${publicAssetOriginPlaceholder} in ${headersPath}`)
      }
      await writeFile(headersPath, headers.replaceAll(publicAssetOriginPlaceholder, origin), 'utf8')
    },
  }
}

export default defineConfig(({ mode }) => {
  const buildEnv = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [
      TanStackRouterVite(),
      react(),
      tailwindcss(),
      injectPublicAssetCsp(publicAssetOrigin(
        buildEnv.VITE_PUBLIC_ASSET_URL,
        buildEnv.VITE_API_URL,
      )),
    ],
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      env: {
        VITE_API_URL: 'http://localhost:5000',
        VITE_PUBLIC_ASSET_URL: 'https://assets.palladin.io',
        VITE_GOOGLE_CLIENT_ID: 'test-client-id',
        VITE_SIGNALR_HUB_URL: 'http://localhost:5000/hubs/notifications',
      },
    },
  }
})
