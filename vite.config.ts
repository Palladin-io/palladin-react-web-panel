/// <reference types="vitest/config" />
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { assertRequiredClientEnv } from './src/shared/lib/required-client-env'
import { connectionOrigins } from './build/csp-origins'

const publicAssetOriginPlaceholder = '__PALLADIN_PUBLIC_ASSET_ORIGIN__'
const connectionOriginsPlaceholder = '__PALLADIN_CONNECTION_ORIGINS__'

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

function injectDeploymentCsp(origin: string, connections: string): Plugin {
  return {
    name: 'inject-deployment-csp',
    apply: 'build',
    async writeBundle(options) {
      const headersPath = resolve(options.dir ?? 'dist', '_headers')
      const headers = await readFile(headersPath, 'utf8')
      if (!headers.includes(publicAssetOriginPlaceholder) || !headers.includes(connectionOriginsPlaceholder)) {
        throw new Error(`Missing deployment CSP placeholder in ${headersPath}`)
      }
      await writeFile(headersPath, headers.replaceAll(publicAssetOriginPlaceholder, origin)
        .replaceAll(connectionOriginsPlaceholder, connections), 'utf8')
    },
  }
}

export default defineConfig(({ command, isPreview, mode }) => {
  const buildEnv = loadEnv(mode, process.cwd(), '')
  if (command === 'serve' && !isPreview && mode !== 'test') {
    assertRequiredClientEnv(buildEnv)
  }

  return {
    plugins: [
      TanStackRouterVite(),
      react(),
      tailwindcss(),
      injectDeploymentCsp(publicAssetOrigin(
        buildEnv.VITE_PUBLIC_ASSET_URL,
        buildEnv.VITE_API_URL,
      ), connectionOrigins(buildEnv.VITE_API_URL, buildEnv.VITE_SIGNALR_HUB_URL)),
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
