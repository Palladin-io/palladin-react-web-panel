import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VAULT_ICON_ALL } from '../../features/vaults/components/vault-presentation'
import { ENTRY_ICON_OPTIONS } from '../../features/vaults/components/entry-presentation'
import { AGENT_ICON_ALL } from '../../features/agents/components/agent-presentation'
import { AUDIT_EVENT_TYPES } from '../../features/audit/api/audit-api'
import { auditEventConfig } from '../../features/audit/components/audit-event-config'
import { Icon } from './icon'
import { ICON_GLYPHS } from './icon-glyphs'

describe('Icon', () => {
  const catalog = [...new Set([
    ...VAULT_ICON_ALL, ...ENTRY_ICON_OPTIONS, ...AGENT_ICON_ALL,
    ...AUDIT_EVENT_TYPES.map((event) => auditEventConfig(event).icon),
    'add', 'search', 'close', 'content_copy', 'expand_more', 'check_circle',
    'logout', 'history', 'inbox', 'light_mode', 'dark_mode',
  ])]

  it.each(catalog)('renders %s as a bundled SVG without font ligature text', (name) => {
    expect(Object.hasOwn(ICON_GLYPHS, name)).toBe(true)
    const { container } = render(<Icon name={name} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg?.childElementCount).toBeGreaterThan(0)
    expect(container.textContent).toBe('')
  })

  it.each(['unknown_stored_icon', 'constructor', '__proto__'])('uses a visible local fallback for %s', (name) => {
    const { container } = render(<Icon name={name} size={22} color="var(--cv-primary)" className="animate-spin" />)
    expect(container.querySelector('svg')).toHaveClass('lucide-circle-question-mark', 'animate-spin')
    expect(container.querySelector('svg')).toHaveStyle({ width: 'calc(22px * var(--cv-density-scale, 1))' })
    expect(container.textContent).toBe('')
  })
})
