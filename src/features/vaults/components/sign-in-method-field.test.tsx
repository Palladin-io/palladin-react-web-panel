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

describe('SignInMethodField collection', () => {
  it('shows only heading and add in the empty state; cancel never creates data', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[other]} />)
    expect(screen.getByText('Sign-in methods')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add sign-in method' }))
    await user.selectOptions(screen.getByLabelText('Provider'), 'apple')
    await user.type(screen.getByLabelText('Provider account'), 'cancelled')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(dump()).toEqual([other])
  })

  it('adds two same-provider accounts, edits one and removes only that method', async () => {
    const user = userEvent.setup()
    const opaque = { ...other, id: 'future', type: 'palladin.signin.v99' }
    render(<Harness initial={[other, opaque]} />)
    for (const account of ['personal@example.test', 'work@example.test']) {
      await user.click(screen.getByRole('button', { name: 'Add sign-in method' }))
      await user.selectOptions(screen.getByLabelText('Provider'), 'google')
      await user.type(screen.getByLabelText('Provider account'), account)
      expect(dump()).toHaveLength(account.startsWith('personal') ? 2 : 3)
      await user.click(screen.getByRole('button', { name: 'Save' }))
    }
    const original = dump()
    expect(original.slice(0, 2)).toEqual([other, opaque])
    expect(original.slice(2).every((field) => field.type === 'palladin.signin.v2')).toBe(true)
    await user.click(screen.getAllByRole('button', { name: 'Edit sign-in method' })[0])
    await user.clear(screen.getByLabelText('Provider account'))
    await user.type(screen.getByLabelText('Provider account'), 'changed')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(dump()[2]).toEqual({ ...original[2], value: { provider: 'google', account: 'changed', entry: null } })
    expect(dump()[3]).toEqual(original[3])
    await user.click(screen.getAllByRole('button', { name: 'Edit sign-in method' })[0])
    await user.click(screen.getByRole('button', { name: 'Remove sign-in method' }))
    expect(dump()).toEqual([other, opaque, original[3]])
  })

  it('migrates only the explicitly edited legacy method and keeps its case-sensitive ID', async () => {
    const user = userEvent.setup()
    const first = binding('ABCDEFAB-1234-4234-8234-ABCDEFABCDEF', { provider: 'google', account: 'legacy', entry: null })
    const second = binding('second', { provider: 'apple', account: null, entry: null })
    render(<Harness initial={[first, second]} />)
    await user.click(screen.getAllByRole('button', { name: 'Edit sign-in method' })[0])
    await user.selectOptions(screen.getByLabelText('Provider'), 'github')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(dump()).toEqual([{ ...first, type: 'palladin.signin.v2', value: { provider: 'github', account: 'legacy', entry: null } }, second])
  })

  it('offers explicit provider Entry choices and drops the reference when account changes', async () => {
    const user = userEvent.setup()
    publishCredentials()
    render(<Harness initial={[binding('keep', { provider: 'google', account: null, entry: null })]} />)
    await user.click(screen.getByRole('button', { name: 'Edit sign-in method' }))
    const picker = await screen.findByLabelText('Palladin account')
    await waitFor(() => expect(within(picker).getAllByRole('option')).toHaveLength(3))
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Not linked', 'Google personal · alice@gmail.com', 'Google work · bob@corp.com',
    ])
    await user.selectOptions(picker, `${VAULT_ID}/${WORK.id}`)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(dump()[0].value).toEqual({ provider: 'google', account: 'bob@corp.com', entry: { vaultId: VAULT_ID, entryId: WORK.id } })
    await user.click(screen.getByRole('button', { name: 'Edit sign-in method' }))
    await user.type(screen.getByLabelText('Provider account'), 'x')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(dump()[0].value).toEqual({ provider: 'google', account: 'bob@corp.comx', entry: null })
  })

  it('keeps visibility changes inside the editor until save and addresses the selected ID', async () => {
    const user = userEvent.setup()
    const visibility = { isVisible: () => true, onChange: vi.fn() }
    render(<Harness initial={[binding('keep', { provider: 'google', account: null, entry: null })]} agentVisibility={visibility} />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit sign-in method' }))
    await user.click(screen.getByRole('switch', { name: 'Visible to agents' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(visibility.onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Edit sign-in method' }))
    await user.click(screen.getByRole('switch', { name: 'Visible to agents' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(visibility.onChange).toHaveBeenCalledWith('keep', false)
  })
})
