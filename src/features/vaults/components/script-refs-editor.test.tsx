import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ScriptRef } from '../types'
import { ScriptRefsEditor } from './script-refs-editor'
import { validateScriptRefs } from '../script-refs'

// The editor loads the vault's entries for its source picker.
vi.mock('../use-entries', async (orig) => ({
  ...(await orig<typeof import('../use-entries')>()),
  useAllEntries: () => ({ data: [] }),
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
})
