import { afterEach, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ presignAgentIcon: vi.fn(), completeAgentIconUpload: vi.fn() }))
vi.mock('./api/agents-api', () => api)
import { uploadAgentIcon } from './upload-agent-icon'

afterEach(() => vi.unstubAllGlobals())

it('uploads with the expected SHA-256 when SubtleCrypto is unavailable', async () => {
  const bytes = new TextEncoder().encode('abc')
  const file = new File([bytes], 'icon.png', { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer })
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
  api.presignAgentIcon.mockResolvedValue({ uploadUrl: 'https://upload.example.test', uploadSessionId: 'upload', maximumBytes: 1024 })
  api.completeAgentIconUpload.mockResolvedValue({ assetId: 'asset', publicUrl: 'https://assets.example.test/icon.png' })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

  await expect(uploadAgentIcon('agent', file)).resolves.toMatchObject({ ok: true, iconReference: 'public-asset:asset' })
  expect(api.presignAgentIcon).toHaveBeenCalledWith('agent', {
    mediaType: 'image/png', byteLength: 3,
    sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  })
})
