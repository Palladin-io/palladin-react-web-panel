import { getAccount, memberKeySuiteOf } from '../../shared/api/account-api'
import {
  buildApproverKeySetChange,
  openOwnApproverKeys,
  wipeApproverKeys,
  type ApproverKeySetChangeKind,
  type ApproverMemberAuthority,
  type OpenedApproverKeys,
} from '../../shared/crypto/agent-submission'
import { organizationIdFromAccessToken } from '../../shared/lib/organization-scope'
import { useAuthStore } from '../auth'
import { isKeyMigrationPending } from '../../shared/crypto/key-wrapper'
import {
  APPROVER_KEY_STATUS_ABSENT,
  APPROVER_KEY_STATUS_READY,
  getApproverKeys,
  issueApproverKeyChallenge,
  submitApproverKeySetChange,
  type ApproverKeyChangeRoute,
  type ApproverKeysResponse,
} from './api/submissions-api'

export class ApproverKeysLockedError extends Error {
  constructor() {
    super('Unlock is required for approver keys')
    this.name = 'ApproverKeysLockedError'
  }
}

export class ApproverKeysNotServedError extends Error {
  constructor() {
    super('The caller holds no current approver key wrap')
    this.name = 'ApproverKeysNotServedError'
  }
}

const CHANGE_ROUTE: Record<ApproverKeySetChangeKind, ApproverKeyChangeRoute> = {
  bootstrap: 'bootstrap',
  addApprovers: 'add-approvers',
  rotate: 'rotate',
  rebootstrap: 'rebootstrap',
}

/**
 * Authority independent of the approver-key response: Identity's account
 * (principal and current Member key version), the JWT organization and the
 * in-memory Member private key.
 */
export async function currentMemberAuthority(): Promise<ApproverMemberAuthority> {
  const privateKey = useAuthStore.getState().privateKey
  if (!privateKey) throw new ApproverKeysLockedError()
  const account = await getAccount()
  const { accessToken, userId } = useAuthStore.getState()
  const organizationId = organizationIdFromAccessToken(accessToken)
  if (useAuthStore.getState().privateKey !== privateKey || !organizationId
    || !account.memberKeyVersion || account.userId !== userId || !userId) {
    throw new ApproverKeysLockedError()
  }
  return {
    organizationId, memberId: userId, memberKeyVersion: account.memberKeyVersion,
    memberKey: { privateKey, keySuiteId: memberKeySuiteOf(account) },
  }
}

export function isServedApprover(state: ApproverKeysResponse): boolean {
  return state.status === APPROVER_KEY_STATUS_READY && (state.myWraps?.length ?? 0) === 2 && state.manifest !== null
}

/** Automatic maintenance needs no decision; re-bootstrap is always explicit. */
export function nextApproverKeyAction(state: ApproverKeysResponse): ApproverKeySetChangeKind | null {
  if (state.status === APPROVER_KEY_STATUS_ABSENT) return 'bootstrap'
  if (!isServedApprover(state)) return null
  if (state.rotationRequired) return 'rotate'
  if (state.approvers.some((approver) => !approver.hasWrap)) return 'addApprovers'
  return null
}

export async function loadOwnApproverKeys(): Promise<{ keys: OpenedApproverKeys; authority: ApproverMemberAuthority }> {
  const [state, authority] = await Promise.all([getApproverKeys(), currentMemberAuthority()])
  if (!isServedApprover(state)) throw new ApproverKeysNotServedError()
  return { keys: await openOwnApproverKeys(state.manifest!, state.myWraps!, authority), authority }
}

export async function runApproverKeyChange(
  kind: ApproverKeySetChangeKind,
  state: ApproverKeysResponse,
): Promise<void> {
  const authority = await currentMemberAuthority()
  const currentKeys = kind === 'addApprovers' || kind === 'rotate'
    ? await openOwnApproverKeys(state.manifest!, state.myWraps ?? [], authority)
    : undefined
  try {
    const challenge = await issueApproverKeyChallenge()
    const change = await buildApproverKeySetChange({
      kind,
      organizationId: authority.organizationId,
      memberId: authority.memberId,
      memberKey: authority.memberKey,
      challenge,
      ...(state.manifest ? { currentManifest: state.manifest } : {}),
      ...(currentKeys ? { currentKeys } : {}),
    })
    // Material prepared by an invalidated unlock session is never submitted.
    if (useAuthStore.getState().privateKey !== authority.memberKey.privateKey) throw new ApproverKeysLockedError()
    await submitApproverKeySetChange(CHANGE_ROUTE[kind], { challengeId: challenge.challengeId, ...change })
  } finally {
    if (currentKeys) wipeApproverKeys(currentKeys)
  }
}

/**
 * Security upgrade: the caller's approver wraps still address the legacy Member
 * key, so the key set is rotated (keyVersion + 1, continuity-signed) to an
 * active-suite manifest while the legacy key is still in memory. Approvers that
 * have not migrated yet block sealing (`key-migration-pending`); the rotation is
 * then left to a later upgrade or an explicit re-bootstrap.
 */
export async function rotateApproverKeysAfterSecurityUpgrade(legacy: {
  memberKey: { keySuiteId: string; privateKey: Uint8Array }
  memberKeyVersion: number
}): Promise<void> {
  const state = await getApproverKeys()
  if (!isServedApprover(state)) return
  const authority = await currentMemberAuthority()
  let currentKeys: Awaited<ReturnType<typeof openOwnApproverKeys>> | undefined
  try {
    currentKeys = await openOwnApproverKeys(state.manifest!, state.myWraps!, {
      ...authority, memberKeyVersion: legacy.memberKeyVersion, memberKey: legacy.memberKey,
    })
  } catch {
    return
  }
  try {
    const challenge = await issueApproverKeyChallenge()
    const change = await buildApproverKeySetChange({
      kind: 'rotate',
      organizationId: authority.organizationId,
      memberId: authority.memberId,
      memberKey: authority.memberKey,
      challenge,
      currentManifest: state.manifest!,
      currentKeys,
    })
    if (useAuthStore.getState().privateKey !== authority.memberKey.privateKey) throw new ApproverKeysLockedError()
    await submitApproverKeySetChange(CHANGE_ROUTE.rotate, { challengeId: challenge.challengeId, ...change })
  } catch (error) {
    if (!isKeyMigrationPending(error)) throw error
  } finally {
    wipeApproverKeys(currentKeys)
  }
}
