import type { SharedUnlockOperationMaterial } from '../../../shared/crypto/shared-unlock-receiver'
import type { SharedUnlockContext } from '@palladin/crypto'
import type { AuthResponse } from '../../../shared/api/types'

export interface SharedUnlockPreference {
  readonly sharedUnlockEnabled: boolean;
  readonly revision: number;
}

export interface SharedUnlockAuthorization {
  readonly authorizationId: string;
  readonly sequence: number;
  readonly accountId: string;
  readonly organizationId: string;
  readonly credentialRevision: number;
  readonly privateKeyWrapRevision: number;
  readonly authorizationVersion: number;
  readonly unlockedAtMs: number;
  readonly idleDeadlineMs: number;
  readonly absoluteDeadlineMs: number;
  readonly offlineDeadlineMs: number;
}

export interface SharedUnlockManualInput {
  readonly authCredential: string;
  readonly sourceGeneration: string;
  readonly expectedPreferenceRevision: number;
  readonly expectedCredentialRevision: number;
  readonly expectedPrivateKeyWrapRevision: number;
  readonly idleDeadlineMs: number;
  readonly absoluteDeadlineMs: number;
  readonly offlineDeadlineMs: number;
}


export type SharedUnlockOperation = SharedUnlockOperationMaterial

export interface SharedUnlockCommit {
  readonly session: AuthResponse & {
    readonly emailVerified: boolean;
    readonly waitlistDeveloperBenefitStartedAt: string | null;
    readonly waitlistDeveloperBenefitEndsAt: string | null;
  };
  readonly authorizationId: string;
  readonly authorizationSequence: number;
  readonly context: SharedUnlockContext;
}

export interface SharedUnlockOperationInput {
  readonly authorizationId: string;
  readonly linkId: string;
  readonly linkEpoch: number;
  readonly expectedPreferenceRevision: number;
  readonly recipientOrganizationId: string;
  readonly idleDeadlineMs: number;
  readonly absoluteDeadlineMs: number;
  readonly offlineDeadlineMs: number;
  readonly direction: SharedUnlockContext["direction"];
  readonly apiOrigin: string;
  readonly webOrigin: string;
  readonly extensionId: string;
  readonly documentBinding: string;
  readonly webGeneration: string;
  readonly extensionGeneration: string;
  readonly sourcePublicKey: string;
  readonly recipientPublicKey: string;
  readonly recipientProofPublicKey: string;
}
