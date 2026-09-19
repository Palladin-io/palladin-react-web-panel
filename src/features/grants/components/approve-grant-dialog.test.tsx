import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApproveGrantDialog } from './approve-grant-dialog'
import type { PendingGrant } from '../api/pending-grants-api'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_SCRIPT } from '../../../shared/types/entry-type'

const grant: PendingGrant = {
  id: 'g1',
  vaultId: 'v1',
  vaultName: 'Production',
  agentId: 'a1',
  agentName: 'Deploy Bot',
  agentPublicKey: 'PUBKEY',
  entryId: 'e1',
  entryLabel: 'Gmail',
  reason: 'Need it',
  createdAt: '2026-06-01T10:00:00Z',
  encryptedReason: { descriptor: { binding: { requestedMethods: 6 } } },
} as PendingGrant

const review = {
  entryLabel: 'Gmail',
  reason: 'Need it for deployment',
  entryRevision: '7',
  entryType: ENTRY_TYPE_CREDENTIAL,
  fields: [
    { id: 'password', label: 'password', access: 'onGrantValue' as const },
    { id: 'totp', label: 'totp', access: 'onGrantDerived' as const },
  ],
}

describe('ApproveGrantDialog — access type dropdown', () => {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    onConfirm.mockReset()
    onCancel.mockReset()
  })

  function renderDialog() {
    render(
      <ApproveGrantDialog
        grant={grant}
        review={review}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )
  }

  it('renders the title, the agent/entry/vault names, and the access-type dropdown', () => {
    renderDialog()
    expect(screen.getByText('Approve Access')).toBeInTheDocument()
    // Subtitle emphasises the agent + vault names and shows the entry by name.
    expect(screen.getByText('Deploy Bot')).toBeInTheDocument()
    expect(screen.getByText('Gmail')).toBeInTheDocument()
    expect(screen.getByText('this vault')).toBeInTheDocument()
    const select = screen.getByLabelText(/Access type/i)
    expect(select).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Time Limited/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Number of Uses/i })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: /Lifetime \(never expires\)/i }),
    ).toBeInTheDocument()
  })

  it('defaults Time Limited to a future expiry and confirms with it', async () => {
    const user = userEvent.setup()
    renderDialog()
    // Time Limited is the default kind; the expiry pre-fills to ~1 day ahead,
    // shown as a relative distance ("in 23 hours" / "in 1 day").
    expect(screen.getByText(/Expires in \d+ (hour|day)/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toHaveProperty('expiresAt')
  })

  it('lets the owner restrict this grant to selected fields', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByLabelText('Shared fields')).toHaveValue('all')
    await user.selectOptions(screen.getByLabelText('Shared fields'), 'selected')
    await user.click(screen.getByRole('button', { name: 'Choose fields' }))
    await user.click(screen.getByRole('option', { name: 'totp' }))
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Object), ['exec', 'inject'], ['password'], 'selected')
  })

  it('a quick-duration chip sets the expiry', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: '6h' }))
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    const body = onConfirm.mock.calls[0][0]
    expect(body).toHaveProperty('expiresAt')
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('a quick-minutes chip sets the expiry', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: '15min' }))
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0][0]).toHaveProperty('expiresAt')
  })

  it('Custom opens the on-brand date-time picker', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByRole('button', { name: /custom/i }))
    expect(
      screen.getByRole('dialog', { name: /choose date and time/i }),
    ).toBeInTheDocument()
  })

  it('confirms with queryLimit only when Number of Uses is selected', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText(/Access type/i), 'uses')
    await user.type(screen.getByLabelText(/Maximum uses/i), '3')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    // Methods default to the privacy-preserving set when the grant requested none.
    expect(onConfirm).toHaveBeenCalledWith({ queryLimit: 3 }, ['exec', 'inject'], ['password', 'totp'], 'all')
  })

  it('confirms with an empty body when Lifetime is selected (neither field)', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText(/Access type/i), 'lifetime')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({}, ['exec', 'inject'], ['password', 'totp'], 'all')
  })

  it('rejects an invalid usage limit', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.selectOptions(screen.getByLabelText(/Access type/i), 'uses')
    await user.type(screen.getByLabelText(/Maximum uses/i), '0')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('defaults approval to exactly the methods in the encrypted request', async () => {
    const user = userEvent.setup()
    renderDialog()
    const methods = screen.getByRole('combobox', { name: /how the agent may use it/i })
    expect(methods).toHaveTextContent('Exec, Inject')
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm.mock.calls[0][1]).toEqual(['exec', 'inject'])
  })

  it('keeps the authenticated method selection editable for Script entries', async () => {
    const user = userEvent.setup()
    render(
      <ApproveGrantDialog
        grant={grant}
        review={{ ...review, entryType: ENTRY_TYPE_SCRIPT }}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('combobox', { name: /how the agent may use it/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm.mock.calls[0][1]).toEqual(['exec', 'inject'])
  })

  it('shows the revision-bound Script contract before approving a ScriptExecution request', () => {
    render(
      <ApproveGrantDialog
        grant={{
          ...grant,
          type: 'scriptExecution',
          encryptedReason: { descriptor: { binding: { requestedMethods: 2 } } },
        } as PendingGrant}
        review={{
          ...review,
          entryType: ENTRY_TYPE_SCRIPT,
          scriptContract: {
            metadata: {
              contractVersion: 1,
              description: 'Returns deployment users',
              parameters: [{
                name: 'limit',
                description: 'Maximum users',
                type: 'integer',
                required: true,
              }],
              returnResultToAgent: true,
            },
            references: [{
              env: 'DB_PASSWORD',
              entryId: '33333333-3333-4333-8333-333333333333',
              fieldId: 'credential.password',
            }],
          },
        }}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByText('Returns deployment users')).toBeInTheDocument()
    expect(screen.getByText('$DB_PASSWORD ← 33333333…333333 · credential.password')).toBeInTheDocument()
    expect(screen.getByText(/agent may receive stdout as result/i)).toBeInTheDocument()
  })

  it('allows the authenticated Inject selection for Script entries', async () => {
    const user = userEvent.setup()
    render(
      <ApproveGrantDialog
        grant={{ ...grant, encryptedReason: { descriptor: { binding: { requestedMethods: 4 } } } } as PendingGrant}
        review={{ ...review, entryType: ENTRY_TYPE_SCRIPT }}
        isPending={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByRole('button', { name: /^approve access$/i })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm.mock.calls[0][1]).toEqual(['inject'])
  })

  it('defaults to all current and future grantable fields', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^approve access$/i }))
    expect(onConfirm).toHaveBeenCalledWith(expect.any(Object), ['exec', 'inject'], ['password', 'totp'], 'all')
  })
})
