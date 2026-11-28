import { act, fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({
  assets: new Map<string, { url: string }>(),
  revision: 0,
  listeners: new Set<() => void>(),
}))

vi.mock('../../../shared/api/public-assets-api', () => ({
  cachedPublicAsset: (id: string) => cache.assets.get(id),
  publicAssetCacheRevision: () => cache.revision,
  subscribePublicAssetCache: (listener: () => void) => {
    cache.listeners.add(listener)
    return () => cache.listeners.delete(listener)
  },
}))

import { AgentAvatar } from './agent-avatar'
import { agentAvatarColor } from './agent-presentation'

const ASSET_ID = '00000000-0000-4000-8000-0000000000a1'

function publish(id: string, url: string) {
  cache.assets.set(id, { url })
  cache.revision += 1
  for (const listener of cache.listeners) listener()
}

function frame(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement
}

describe('AgentAvatar', () => {
  beforeEach(() => {
    cache.assets.clear()
    cache.revision = 0
  })

  it('colours the glyph and its border with the chosen icon colour', () => {
    const { container } = render(
      <AgentAvatar agent={{ agentId: 'a1', name: 'Reports', iconKey: 'cloud', iconColor: '#A78BFA' }} />,
    )

    expect(frame(container).style.borderColor).toBe('rgb(167, 139, 250)')
    expect(container.querySelector('svg')).not.toBeNull()
    expect(frame(container).textContent).toBe('')
  })

  it('falls back to the glyph default colour without an explicit icon colour', () => {
    const { container } = render(
      <AgentAvatar agent={{ agentId: 'a1', name: 'Code', iconKey: 'terminal' }} />,
    )

    expect(frame(container).style.borderColor).toBe('rgb(16, 185, 129)')
  })

  it('tints initials from the stable agent id rather than the name', () => {
    const first = render(<AgentAvatar agent={{ agentId: 'agent-7', name: 'Release manager', iconKey: null }} />)
    const renamed = render(<AgentAvatar agent={{ agentId: 'agent-7', name: 'Zeta bot', iconKey: null }} />)

    expect(frame(first.container).textContent).toBe('RM')
    expect(frame(renamed.container).textContent).toBe('ZB')
    expect(frame(first.container).style.color).toBe(frame(renamed.container).style.color)
  })

  it('matches the mobile and extension initials palette for the same agent id', () => {
    expect(agentAvatarColor('01a213b1-0000-4000-8000-000000000001')).toBe('#60A5FA')
    expect(agentAvatarColor('agent-7')).toBe('#A78BFA')
    expect(agentAvatarColor('x')).toBe('#FFAB87')
    expect(agentAvatarColor('')).toBe('#8A95A6')
  })

  it('shows initials until an uploaded icon is hydrated, then renders it with a neutral border', () => {
    const { container } = render(
      <AgentAvatar agent={{ agentId: 'a1', name: 'Design reviewer', iconKey: `public-asset:${ASSET_ID}` }} />,
    )
    expect(frame(container).textContent).toBe('DR')

    act(() => publish(ASSET_ID, 'https://assets.example.test/published/agent-icon/1.png'))

    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://assets.example.test/published/agent-icon/1.png')
    expect(frame(container).style.borderColor).toBe('')
  })

  it('falls back to initials when the uploaded icon fails to load', () => {
    publish(ASSET_ID, 'https://assets.example.test/published/agent-icon/1.png')
    const { container } = render(
      <AgentAvatar agent={{ agentId: 'a1', name: 'Design reviewer', iconKey: `public-asset:${ASSET_ID}` }} />,
    )

    fireEvent.error(container.querySelector('img')!)

    expect(container.querySelector('img')).toBeNull()
    expect(frame(container).textContent).toBe('DR')
  })
})
