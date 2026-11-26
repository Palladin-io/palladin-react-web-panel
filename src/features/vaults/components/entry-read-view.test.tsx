import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemberSecretView } from '../../../shared/crypto/entry-draft'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  type EntryPlaintext,
} from '../types'
import { EntryReadView } from './entry-read-view'

vi.mock('./script-editor', () => ({
  ScriptEditor: ({ value }: { value: string }) => <pre data-testid="script-editor">{value}</pre>,
}))

const SYNTHETIC_TOTP_SEED = 'GEZDGNBVGY3TQOJQ'

function secret(content: EntryPlaintext, extra: Partial<MemberSecretView> = {}): MemberSecretView {
  return {
    memberLabel: 'Example',
    agentLabel: 'Example',
    entryType: content.type,
    content,
    agentVisibilityPolicy: { discoverable: false, fields: {} },
    ...extra,
  }
}

function renderView(value: MemberSecretView, onEdit = vi.fn()) {
  render(<EntryReadView vaultId="vault-1" vaultName="Team" entryType={value.entryType} icon={undefined}
    secret={value} onEdit={onEdit} />)
  return onEdit
}

describe('EntryReadView', () => {
  it('shows a Credential masked, with provider sign-in, without agent controls, and hides empty fields', () => {
    const onEdit = renderView(secret({
      type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'fixture-password', url: '',
      fields: [{ id: 'signin', label: 'Sign-in methods', type: 'palladin.signin.v2',
        value: { provider: 'github', account: 'alice@example.com', entry: null } as never }],
    }))

    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('fixture-password')).not.toBeInTheDocument()
    expect(screen.getByText('Sign in with GitHub')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    expect(screen.queryByText('URL')).not.toBeInTheDocument()
    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open website/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^reveal$/i }))
    expect(screen.getByText('fixture-password')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('shows only the last four card digits until revealed', () => {
    renderView(secret({
      type: ENTRY_TYPE_CREDIT_CARD, cardholderName: 'Ada Lovelace', cardNumber: '4111111111111111',
      cvv: '123', expiryMonth: '08', expiryYear: '2029',
    }))

    expect(screen.getByText('•••• 1111')).toBeInTheDocument()
    expect(screen.getByText('08/2029')).toBeInTheDocument()
    expect(screen.queryByText('123')).not.toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /^reveal$/i })[0]!)
    expect(screen.getByText('4111 1111 1111 1111')).toBeInTheDocument()
  })

  it('shows a Key value masked with copy and the website action', () => {
    renderView(secret({ type: ENTRY_TYPE_KEY, value: 'sk-test-value', url: 'https://example.com' }))

    expect(screen.queryByText('sk-test-value')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /open website/i })).toBeInTheDocument()
  })

  it('shows the Script contract: code, injected data, parameters and result return', () => {
    renderView(secret({
      type: ENTRY_TYPE_SCRIPT, interpreter: 'bash', script: 'echo "$TOKEN"',
      refs: [{ env: 'TOKEN', vaultId: 'vault-1', entryId: 'missing-entry', field: 'value' }],
      execution: { contractVersion: 1, description: 'Prints a token.', returnResultToAgent: true,
        parameters: [{ name: 'limit', description: 'Maximum rows.', type: 'integer', required: false }] },
    }))

    expect(screen.getByTestId('script-editor')).toHaveTextContent('echo "$TOKEN"')
    expect(screen.getByText('Prints a token.')).toBeInTheDocument()
    expect(screen.getByText('TOKEN')).toBeInTheDocument()
    expect(screen.getByText('limit')).toBeInTheDocument()
    expect(screen.getByText('Maximum rows.')).toBeInTheDocument()
    expect(screen.getByText('Yes')).toBeInTheDocument()
  })

  it('collapses long notes until expanded', () => {
    const notes = Array.from({ length: 9 }, (_, index) => `line ${index + 1}`).join('\n')
    renderView(secret({ type: ENTRY_TYPE_KEY, value: 'v', notes }))

    const toggle = screen.getByRole('button', { name: 'Show all' })
    expect(screen.getByText(/line 1/).className).toContain('line-clamp-6')
    fireEvent.click(toggle)
    expect(screen.getByText(/line 1/).className).not.toContain('line-clamp-6')
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })

  it('pins a native TOTP like the editor and keeps custom TOTP fields visible', () => {
    renderView(secret({
      type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'p',
      totp: 'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example',
      fields: [{ id: 'custom-totp', label: 'Backup authenticator', type: 'totp',
        value: { secret: SYNTHETIC_TOTP_SEED, algorithm: 'SHA1', digits: 6, period: 30 } as never }],
    }))

    expect(screen.getByText('Two-factor authentication')).toBeInTheDocument()
    expect(screen.getByText('Backup authenticator')).toBeInTheDocument()
    expect(screen.getAllByRole('timer')).toHaveLength(2)
  })

  it('keeps an unrecognized sign-in field as a concealed custom field', () => {
    renderView(secret({ type: ENTRY_TYPE_CREDENTIAL, username: 'alice', password: 'p', fields: [
      { id: 'legacy', label: 'Legacy sign-in', type: 'palladin.signin.v1',
        value: { provider: 'google', account: 'alice@example.com' } as never },
    ] }))

    expect(screen.queryByText(/^Sign in with/)).not.toBeInTheDocument()
    expect(screen.getByText('Legacy sign-in')).toBeInTheDocument()
  })

  it('conceals an unknown TOTP payload instead of rendering a code', () => {
    renderView(secret({ type: ENTRY_TYPE_KEY, value: 'v', fields: [
      { id: 'future', label: 'Future TOTP', type: 'totp', value: { seed: 'new-format' } as never },
    ] }))

    expect(screen.queryByLabelText(/current one-time code/i)).not.toBeInTheDocument()
    expect(screen.queryByText('{"seed":"new-format"}')).not.toBeInTheDocument()
  })
})
