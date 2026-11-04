import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { useMemberSyncStore, type DecryptedMemberVault, type MemberIndexRecord } from '../sync/member-sync-store'
import type { CustomField } from '../types'
import { SignInMethodField, type SignInMethodAgentVisibility } from './sign-in-method-field'

const { openSecretMock } = vi.hoisted(() => ({ openSecretMock: vi.fn() }))
vi.mock('../sync/current-member-entry-reader', () => ({ openCurrentMemberEntrySecret: openSecretMock }))

const VAULT_ID = '0b5e8f0c-1d2a-4c3b-8e4f-5a6b7c8d9e0f'
const SELF_ID = '11111111-2222-4333-8444-555555555555'
const PERSONAL = { id: '7c1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5', label: 'Google personal', domain: 'accounts.google.com', username: 'alice@gmail.com', discoverable: true }
const WORK = { id: '8d2e3f40-5b6c-4d7e-8f90-a1b2c3d4e5f6', label: 'Google work', domain: 'google.com', username: 'bob@corp.com', discoverable: true }
const HIDDEN = { id: '9e3f4051-6c7d-4e8f-9a01-b2c3d4e5f607', label: 'Google hidden', domain: 'google.com', username: 'carol@gmail.com', discoverable: false }
const GITHUB = { id: 'af405162-7d8e-4f90-8b12-c3d4e5f60718', label: 'GitHub', domain: 'github.com', username: 'octocat', discoverable: true }
const SELF = { id: SELF_ID, label: 'This entry', domain: 'google.com', username: 'self@gmail.com', discoverable: true }
const CREDENTIALS = [PERSONAL, WORK, HIDDEN, GITHUB, SELF]

function publishCredentials() {
  const entries = new Map(CREDENTIALS.map((credential) => [credential.id, {
    entryId: credential.id, state: 'active', corrupt: false, currentRevision: '1', currentKeyVersion: 1,
    payload: { entryType: 'credential', memberLabel: credential.label, urlDomain: credential.domain, username: credential.username },
  } as unknown as MemberIndexRecord]))
  useMemberSyncStore.setState({ vaults: new Map([[VAULT_ID, { vaultId: VAULT_ID, entries } as unknown as DecryptedMemberVault]]) })
}

function Harness({ initial = [] as CustomField[], agentVisibility }: { initial?: CustomField[]; agentVisibility?: SignInMethodAgentVisibility }) {
  const [fields, setFields] = useState<CustomField[]>(initial)
  return (
    <>
      <SignInMethodField fields={fields} onChange={setFields} entryId={SELF_ID} agentVisibility={agentVisibility} />
      <output data-testid="dump">{JSON.stringify(fields)}</output>
    </>
  )
}

const dump = (): CustomField[] => JSON.parse(screen.getByTestId('dump').textContent!)
const other: CustomField = { id: 'other', label: 'Recovery', type: 'text', value: 'abc' }

function binding(id: string, value: unknown): CustomField {
  return { id, label: 'Sign-in method', type: 'palladin.signin.v1', value: value as CustomField['value'] }
}

beforeEach(() => {
  openSecretMock.mockReset().mockImplementation(async ({ entryId }: { entryId: string }) => ({
    discoverable: CREDENTIALS.find((credential) => credential.id === entryId)?.discoverable ?? false,
  }))
  useAuthStore.setState({ userId: '22222222-3333-4444-8555-666666666666', privateKey: new Uint8Array(32) })
})

afterEach(() => {
  useMemberSyncStore.getState().clear()
  useAuthStore.setState({ userId: null, privateKey: null })
})

describe('SignInMethodField', () => {
  it('renders the empty prompt without creating a field', () => {
    render(<Harness initial={[other]} />)
    expect(screen.getByText('Sign in with Google, Apple or another provider?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add sign-in method' })).toBeInTheDocument()
    expect(dump()).toEqual([other])
  })

  it('adds a binding after an explicit provider choice and stores a trimmed, unlinked account', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[other]} />)

    await user.click(screen.getByRole('button', { name: 'Add sign-in method' }))
    expect(dump()).toEqual([other])
    await user.selectOptions(screen.getByLabelText('Provider'), 'apple')

    const added = dump()[1]
    expect(added).toMatchObject({ label: 'Sign-in method', type: 'palladin.signin.v1',
      value: { provider: 'apple', account: null, entry: null } })
    expect(added.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(screen.queryByLabelText('Palladin account')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Provider account'), '  me@icloud.com ')
    expect(screen.getByLabelText('Provider account')).toHaveValue('  me@icloud.com ')
    expect(dump()[1]).toEqual({ ...added, value: { provider: 'apple', account: 'me@icloud.com', entry: null } })
  })

  it('offers only discoverable Credentials of the provider and links the chosen account', async () => {
    const user = userEvent.setup()
    publishCredentials()
    render(<Harness initial={[binding('keep', { provider: 'google', account: null, entry: null })]} />)

    const picker = await screen.findByLabelText('Palladin account')
    await waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(3))
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Not linked', 'Google personal · alice@gmail.com', 'Google work · bob@corp.com',
    ])

    await user.selectOptions(picker, `${VAULT_ID}/${WORK.id}`)
    expect(dump()[0].value).toEqual({ provider: 'google', account: 'bob@corp.com',
      entry: { vaultId: VAULT_ID, entryId: WORK.id } })
    expect(screen.getByLabelText('Provider account')).toHaveValue('bob@corp.com')

    await user.selectOptions(picker, `${VAULT_ID}/${PERSONAL.id}`)
    expect(dump()[0].value).toEqual({ provider: 'google', account: 'alice@gmail.com',
      entry: { vaultId: VAULT_ID, entryId: PERSONAL.id } })

    await user.type(screen.getByLabelText('Provider account'), 'x')
    expect(dump()[0].value).toEqual({ provider: 'google', account: 'alice@gmail.comx', entry: null })
    expect(openSecretMock).not.toHaveBeenCalledWith(expect.objectContaining({ entryId: GITHUB.id }))
    expect(openSecretMock).not.toHaveBeenCalledWith(expect.objectContaining({ entryId: SELF_ID }))
  })

  it('drops the link when the provider changes and when unlinked explicitly', async () => {
    const user = userEvent.setup()
    publishCredentials()
    const linked = binding('keep', { provider: 'google', account: 'bob@corp.com', entry: { vaultId: VAULT_ID, entryId: WORK.id } })
    const { unmount } = render(<Harness initial={[linked]} />)
    await waitFor(() => expect(screen.getByLabelText('Palladin account')).toHaveValue(`${VAULT_ID}/${WORK.id}`))
    await user.selectOptions(screen.getByLabelText('Palladin account'), '')
    expect(dump()[0].value).toEqual({ provider: 'google', account: 'bob@corp.com', entry: null })
    unmount()

    render(<Harness initial={[linked]} />)
    await user.selectOptions(screen.getByLabelText('Provider'), 'microsoft')
    expect(dump()[0].value).toEqual({ provider: 'microsoft', account: 'bob@corp.com', entry: null })
  })

  it('removes the binding', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[binding('keep', { provider: 'google', account: null, entry: null }), other]} />)
    await user.click(screen.getByRole('button', { name: 'Remove sign-in method' }))
    expect(dump()).toEqual([other])
  })

  it('exposes the owner Discovery switch for a recognized binding', async () => {
    const user = userEvent.setup()
    const agentVisibility = { isVisible: vi.fn(() => true), onChange: vi.fn() }
    render(<Harness initial={[binding('keep', { provider: 'google', account: null, entry: null })]} agentVisibility={agentVisibility} />)

    const toggle = screen.getByRole('switch', { name: 'Visible to agents' })
    expect(toggle).toBeChecked()
    expect(agentVisibility.isVisible).toHaveBeenCalledWith('keep')
    await user.click(toggle)
    expect(agentVisibility.onChange).toHaveBeenCalledWith('keep', false)
  })

  it('never decodes a retired two-key binding and replaces it only on an explicit choice', async () => {
    const user = userEvent.setup()
    const retired = binding('odd', { provider: 'google', account: 'alice@gmail.com' })
    render(<Harness initial={[retired, other]} agentVisibility={{ isVisible: () => true, onChange: vi.fn() }} />)

    expect(screen.getByText(/does not recognize/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Provider account')).not.toBeInTheDocument()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(dump()).toEqual([retired, other])

    await user.click(screen.getByRole('button', { name: 'Replace' }))
    expect(dump()).toEqual([retired, other])
    await user.selectOptions(screen.getByLabelText('Provider'), 'google')

    const next = dump()
    expect(next).toHaveLength(2)
    expect(next[0].id).not.toBe('odd')
    expect(next[0].value).toEqual({ provider: 'google', account: null, entry: null })
    expect(next[1]).toEqual(other)
  })

  it('collapses ambiguous bindings to one on replace, or removes all of them', async () => {
    const user = userEvent.setup()
    const fields = [
      binding('a', { provider: 'google', account: 'x', entry: null }),
      other,
      binding('b', { provider: 'apple', account: null, entry: null }),
    ]
    const { unmount } = render(<Harness initial={fields} />)
    expect(screen.getByText(/more than one saved sign-in method/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replace' }))
    await user.selectOptions(screen.getByLabelText('Provider'), 'facebook')
    expect(dump().filter((field) => field.type === 'palladin.signin.v1')).toHaveLength(1)
    unmount()

    render(<Harness initial={fields} />)
    await user.click(screen.getByRole('button', { name: 'Remove sign-in method' }))
    expect(dump()).toEqual([other])
  })
})
