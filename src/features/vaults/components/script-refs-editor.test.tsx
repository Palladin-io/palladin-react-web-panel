import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ENTRY_TYPE_KEY, type ScriptRef } from '../types'
import { ReferenceFieldOptions, ScriptRefsEditor } from './script-refs-editor'
import { isScriptReferenceFieldSelectable, validateScriptRefs } from '../script-refs'

vi.mock('../sync/member-sync-store', () => ({
  useMemberSyncStore: (selector: (state: unknown) => unknown) => selector({
    vaults: new Map([['v1', {
      entries: new Map([['entry-1', {
        entryId: 'entry-1',
        state: 'active',
        currentRevision: '1',
        corrupt: false,
        payload: {
          memberLabel: 'QA SQL Host',
          entryType: ENTRY_TYPE_KEY,
          customIndex: [],
        },
      }]]),
    }]]),
  }),
}))

function Harness() {
  const [refs, setRefs] = useState<ScriptRef[]>([])
  return (
    <>
      <ScriptRefsEditor vaultId="v1" refs={refs} onChange={setRefs} />
      <output data-testid="count">{refs.length}</output>
    </>
  )
}

function ExistingReferenceHarness() {
  const [refs, setRefs] = useState<ScriptRef[]>([{
    env: 'DB_HOST',
    vaultId: 'v1',
    entryId: 'entry-1',
    field: 'value',
  }])
  return <ScriptRefsEditor vaultId="v1" refs={refs} onChange={setRefs} />
}

describe('ScriptRefsEditor', () => {
  it('renders the "Add reference" ghost row with visible text when empty', () => {
    render(<Harness />)
    const add = screen.getByRole('button', { name: /add reference/i })
    expect(add).toBeInTheDocument()
    expect(add).toHaveTextContent(/add reference/i)
  })

  it('adds a ref row carrying the vault id', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /add reference/i }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    // The new row exposes the env-var input.
    expect(screen.getByLabelText(/env variable/i)).toBeInTheDocument()
  })

  it('shows source names from the decrypted member projection', () => {
    render(<ExistingReferenceHarness />)

    expect(screen.getByRole('combobox', { name: /^entry$/i })).toHaveDisplayValue('QA SQL Host')
    expect(screen.getAllByText('expand_more')).toHaveLength(2)
  })

  it('groups selectable custom fields in the field picker', () => {
    render(<select aria-label="Field"><ReferenceFieldOptions options={[
      { id: 'password', label: 'Password' },
      { id: 'custom:tenant', label: 'Tenant', custom: true },
    ]} /></select>)

    expect(screen.getByRole('group', { name: 'Custom fields' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Tenant' })).toHaveValue('custom:tenant')
  })

  it('rejects unsafe process variables and duplicate reference names', () => {
    const base = { vaultId: 'v1', entryId: 'entry-1', field: 'password' }
    expect(validateScriptRefs([{ ...base, env: 'DATABASE_PASSWORD' }], 'v1')).toBe(true)
    expect(validateScriptRefs([{ ...base, env: 'PATH' }], 'v1')).toBe(false)
    expect(validateScriptRefs([{ ...base, env: 'LD_PRELOAD' }], 'v1')).toBe(false)
    expect(validateScriptRefs([{ ...base, env: 'PALLADIN_TOKEN' }], 'v1')).toBe(false)
    expect(validateScriptRefs([
      { ...base, env: 'DATABASE_PASSWORD' },
      { ...base, entryId: 'entry-2', env: 'database_password' },
    ], 'v1')).toBe(false)
  })

  it('offers only fields whose agent visibility is not never', () => {
    const policy = {
      fields: {
        username: 'discovery',
        password: 'onGrant',
        notes: 'never',
      },
    }

    expect(isScriptReferenceFieldSelectable(policy, 'username')).toBe(true)
    expect(isScriptReferenceFieldSelectable(policy, 'password')).toBe(true)
    expect(isScriptReferenceFieldSelectable({
      fields: { 'custom:tenant': 'onGrantValue' },
    }, 'custom:tenant')).toBe(true)
    expect(isScriptReferenceFieldSelectable(policy, 'notes')).toBe(false)
    expect(isScriptReferenceFieldSelectable(policy, 'missing')).toBe(false)
  })
})
