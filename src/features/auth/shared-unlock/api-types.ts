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

