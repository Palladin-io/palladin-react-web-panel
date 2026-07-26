import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { ENTRY_TYPE_CREDENTIAL } from '../types'
import { EntryAgentsTab } from './entry-agents-tab'

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  update: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32)),
  wipe: vi.fn(),
}))

vi.mock('../../../shared/crypto/vault-v2-entry', async (original) => ({
  ...(await original<typeof import('../../../shared/crypto/vault-v2-entry')>()),
  decryptMemberSecret: mocks.decrypt,
}))
vi.mock('../../../shared/crypto/vault-v2-member-sync', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('../sync/member-sync-api', () => ({ getEncryptedVault: vi.fn(async () => ({
  memberVaultKey: { memberId: 'member' }, memberKeyGeneration: 1,
  currentKeyEpoch: { vaultKeyVersion: 1 },
})) }))
vi.mock('../use-update-canonical-entry', () => ({ useUpdateCanonicalEntry: () => ({
  mutate: mocks.update, isPending: false,
}) }))
vi.mock('../../grants', () => ({ OrgGrantsPanel: () => <div data-testid="grants" /> }))

const detail = {
  organizationId: 'org', vaultId: 'vault', id: 'entry', state: 'active' as const,
  currentRevision: '4', memberIndexRevision: '4', agentDiscoveryRevision: '4',
  agentDiscoveryRevisionHighWatermark: '4', currentKeyVersion: 1,
  createdAt: '', createdBy: 'member', updatedAt: '', updatedBy: 'member',
  memberIndex: {}, memberSecret: {}, agentDiscovery: {}, entryKey: {},
}

const secret = {
  schemaVersion: 1 as const,
  memberLabel: 'GitHub private',
  agentLabel: 'GitHub work',
  entryType: ENTRY_TYPE_CREDENTIAL,
  content: {
    type: ENTRY_TYPE_CREDENTIAL,
    username: 'octocat',
    password: 'secret-password',
    url: 'https://github.com/login',
    fields: [{ id: 'totp-id', label: '2FA', type: 'totp', value: {
      secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1' as const, digits: 6, period: 30,
    } }],
  },
  agentVisibilityPolicy: {
    discoverable: true,
    fields: { agentLabel: 'discovery' as const, username: 'discovery' as const,
      urlDomain: 'discovery' as const, password: 'onGrantValue' as const,
      totp: 'onGrantDerived' as const, 'custom:totp-id': 'onGrantDerived' as const },
  },
}

describe('EntryAgentsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey: new Uint8Array(32) })
    mocks.decrypt.mockResolvedValue(secret)
  })

  it('does not open MemberSecret until the Member explicitly reveals the policy', async () => {
    const user = userEvent.setup()
    render(<EntryAgentsTab vaultId="vault" entryId="entry" entryType={ENTRY_TYPE_CREDENTIAL}
      memberLabel="GitHub private" detail={detail as never} />)
    expect(mocks.decrypt).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /^reveal$/i }))
    await waitFor(() => expect(mocks.decrypt).toHaveBeenCalledTimes(1))
    expect(mocks.wipe).toHaveBeenCalled()
  })

  it('previews Discovery without password or TOTP seed and keeps TOTP derived-only', async () => {
    const user = userEvent.setup()
    render(<EntryAgentsTab vaultId="vault" entryId="entry" entryType={ENTRY_TYPE_CREDENTIAL}
      memberLabel="GitHub private" detail={detail as never} />)
    await user.click(screen.getByRole('button', { name: /^reveal$/i }))
    expect(await screen.findByText('octocat')).toBeInTheDocument()
    expect(screen.queryByText('secret-password')).not.toBeInTheDocument()
    expect(screen.queryByText('JBSWY3DPEHPK3PXP')).not.toBeInTheDocument()
    const totpSelect = screen.getByLabelText(/2fa/i)
    expect(Array.from((totpSelect as HTMLSelectElement).options, (option) => option.value))
      .toEqual(['never', 'onGrantDerived'])
  })

  it('submits the complete canonical draft with the edited policy', async () => {
    const user = userEvent.setup()
    render(<EntryAgentsTab vaultId="vault" entryId="entry" entryType={ENTRY_TYPE_CREDENTIAL}
      memberLabel="GitHub private" detail={detail as never} />)
    await user.click(screen.getByRole('button', { name: /^reveal$/i }))
    const label = await screen.findByRole('textbox', { name: /agent-facing label/i })
    await user.clear(label)
    await user.type(label, 'GitHub CI')
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      detail,
      previous: secret,
      draft: expect.objectContaining({ agentLabel: 'GitHub CI', content: secret.content }),
    }), expect.any(Object))
  })
})
