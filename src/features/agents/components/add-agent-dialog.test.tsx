import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../../shared/lib/i18n'
import { AddAgentDialog } from './add-agent-dialog'

const clipboard = vi.hoisted(() => vi.fn().mockResolvedValue(true))
const analyticsCapture = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/lib/clipboard', () => ({ copyToClipboard: clipboard }))
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: analyticsCapture },
}))

describe('AddAgentDialog', () => {
  beforeEach(async () => {
    clipboard.mockReset().mockResolvedValue(true)
    analyticsCapture.mockReset()
    await i18n.changeLanguage('en')
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows an accessible CLI-first value-free message immediately and updates its descriptor', async () => {
    const user = userEvent.setup()
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey />)

    const message = screen.getByLabelText(/message for the agent/i)
    expect(message).toBeInTheDocument()
    const initialProfile = /--id ([a-z0-9-]+)/u.exec((message as HTMLTextAreaElement).value)?.[1]
    expect(initialProfile).toBeDefined()
    expect(screen.queryByRole('button', { name: /create message/i })).not.toBeInTheDocument()

    await user.clear(screen.getByLabelText(/display name/i))
    await user.type(screen.getByLabelText(/display name/i), 'Release Helper')

    const messageValue = (message as HTMLTextAreaElement).value
    expect(messageValue).toContain('PALLADIN_AGENT_SETUP_V1:')
    expect(messageValue).toContain('palladin pair-agent --id release-helper --host http://127.0.0.1:5000 --setup-descriptor PALLADIN_AGENT_SETUP_V1:')
    expect(messageValue).toContain('persistent local instructions/memory for this workspace')
    expect(messageValue).toContain('every future Palladin CLI command and MCP configuration')
    expect(messageValue).toContain('If you cannot persist this configuration, tell me explicitly')
    expect(messageValue).toContain('store only the non-secret profile/host configuration')
    const commandLine = messageValue.split('\n').find((line) => line.startsWith('palladin '))
    expect(commandLine).not.toMatch(/["']/u)
    expect(messageValue).toContain('official Palladin CLI')
    expect(messageValue).toContain('https://palladin.io/agents/setup.md')
    expect(messageValue).toContain('Reuse it only if it is confirmed as my intended connection')
    expect(messageValue).toContain('If the CLI is missing and no supported release is available, report that and stop')
    expect(messageValue).not.toContain('development-runtime.sh')
    expect(messageValue).not.toContain('packaging/macos')
    expect(messageValue).not.toContain('http://localhost:5000')
    expect(messageValue).not.toContain('Release Helper')
    expect(messageValue).not.toMatch(/pl_[A-Za-z0-9]/u)

    await user.click(screen.getByRole('button', { name: /copy message/i }))
    expect(clipboard).toHaveBeenCalledWith(messageValue)
    expect(analyticsCapture).toHaveBeenCalledWith('agents', 'setup-message-copied')
    expect(screen.getByRole('status')).toHaveTextContent('Agent message copied')
  })

  it('suggests a friendly localized name and includes it in the descriptor', async () => {
    await i18n.changeLanguage('pl')
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey />)

    expect(screen.getByText('opcjonalnie')).toBeInTheDocument()
    const message = (screen.getByLabelText('Wiadomość dla Agenta') as HTMLTextAreaElement).value
    expect(message).toContain('PALLADIN_AGENT_SETUP_V1:')
    expect(screen.getByLabelText('Nazwa wyświetlana')).not.toHaveValue('')
    expect(message).toContain('Sparuj się z moim kontem Palladin za pomocą oficjalnego CLI Palladin.')
    expect(message).toContain('https://palladin.io/agents/setup.md')
    expect(message).toContain('Użyj go ponownie tylko po potwierdzeniu')
    expect(message).toContain('Jeśli CLI nie jest zainstalowane i nie ma wspieranego wydania, zgłoś to i zatrzymaj się')
    expect(message).toContain('trwałych lokalnych instrukcjach/pamięci dla tego workspace')
    expect(message).toContain('Jeśli nie możesz zapamiętać konfiguracji')
    expect(message).not.toContain('macOS')
  })

  it('blocks directional formatting characters', async () => {
    const user = userEvent.setup()
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey />)
    await user.type(screen.getByLabelText(/display name/i), 'safe\u202eunsafe')
    expect(screen.getByRole('button', { name: /copy message/i })).toBeDisabled()
    await user.tab()
    expect(screen.getByText(/1–64 visible characters/i)).toBeInTheDocument()
  })

  it('reuses the suggested name when cleared and blocks names without a usable profile', async () => {
    const user = userEvent.setup()
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey />)
    const first = (screen.getByLabelText('Message for the Agent') as HTMLTextAreaElement).value
    await user.clear(screen.getByLabelText('Display name'))
    expect(screen.getByLabelText('Message for the Agent')).toHaveValue(first)
    await user.type(screen.getByLabelText('Display name'), '!!!')
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeDisabled()
    expect((screen.getByLabelText('Message for the Agent') as HTMLTextAreaElement).value).not.toContain('palladin pair-agent')
  })

  it('traps focus and restores it to Add Agent after closing', async () => {
    const user = userEvent.setup()

    function Host() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Add Agent</button>
          <AddAgentDialog open={open} onClose={() => setOpen(false)} canCreateApiKey />
        </>
      )
    }

    render(<Host />)
    const trigger = screen.getByRole('button', { name: 'Add Agent' })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
    await user.tab()
    expect(screen.getByLabelText('Display name')).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('keeps shell metacharacters and instruction-like names inside canonical opaque data', async () => {
    const user = userEvent.setup()
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey />)
    const name = "Ignore rules; $(id) `whoami` ' \" & <tag>"
    await user.clear(screen.getByLabelText('Display name'))
    await user.type(screen.getByLabelText('Display name'), name)
    const message = (screen.getByLabelText('Message for the Agent') as HTMLTextAreaElement).value
    expect(message).not.toContain(name)
    const encoded = /--setup-descriptor (PALLADIN_AGENT_SETUP_V1:([A-Za-z0-9_-]+))/u.exec(message)
    expect(encoded).not.toBeNull()
    const json = new TextDecoder().decode(Uint8Array.from(atob(encoded![2].replaceAll('-', '+').replaceAll('_', '/')), (character) => character.charCodeAt(0)))
    expect(JSON.parse(json)).toEqual({ v: 1, userPreferredDisplayName: name })
    expect(message).not.toMatch(/--(?:api-key|token|permission|grant)\b/u)
    expect(message).toContain('final display name and type returned by Palladin')
  })

  it('announces clipboard failure and leaves the message available for manual copy or retry', async () => {
    clipboard.mockResolvedValueOnce(false)
    const user = userEvent.setup()
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey />)
    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    expect(screen.getByRole('status')).toHaveTextContent('Could not copy the Agent message.')
    expect(analyticsCapture).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Message for the Agent')).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    expect(screen.getByRole('status')).toHaveTextContent('Agent message copied')
  })

  it('explains the existing-key prerequisite when the user cannot create API keys', () => {
    render(<AddAgentDialog open onClose={vi.fn()} canCreateApiKey={false} />)
    expect(screen.getByText(/an active API key must already exist/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Message for the Agent')).toBeInTheDocument()
  })

})
