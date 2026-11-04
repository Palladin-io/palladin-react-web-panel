import {
  decryptWithKey, deriveRecipientPublicKey, fromBase64Url, hashSharedUnlockKeyContext,
  KEY_WRAPPER_SUITE, toBase64Url, wipe, type SharedUnlockKeyContext,
} from "@palladin/crypto";
import { identityProfileVersion } from "./identity-kdf";
export interface SharedUnlockKeys {
  readonly masterKey: Uint8Array;
  readonly privateKey: Uint8Array;
  /** identity-kdf v3 accountKeys: security version 1 holds a legacy key, version 2 an X-Wing key. */
  readonly memberKeySuiteId: string;
}

/**
 * Identity's descriptor and the operation commitment are independent of the peer
 * envelope. Owns the supplied temporary MK on entry, including every failure.
 * Browser/lifecycle authority stays with the caller's synchronous fence.
 */
export async function recoverSharedUnlockKeys(
  masterKey: Uint8Array,
  descriptor: SharedUnlockKeyContext,
  expectedAccountId: string,
  expectedDigest: string,
  assertCurrent: () => void,
): Promise<SharedUnlockKeys> {
  const context = { ...descriptor };
  let privateKey: Uint8Array | null = null;
  let ciphertext: Uint8Array | null = null;
  let publicKey: Uint8Array | null = null;
  let recovered = false;
  try {
    assertCurrent();
    if (context.accountId !== expectedAccountId || masterKey.length !== 32) throw new Error("Shared unlock key binding failed");
    const version = identityProfileVersion({
      profileId: context.kdfProfileId, securityVersion: context.securityVersion, kdfSalt: context.kdfSalt,
    });
    if (context.minimumSecurityVersion > context.securityVersion) throw new Error("Unsupported shared unlock key context");
    const memberKeySuiteId = version === 2 ? KEY_WRAPPER_SUITE.active : KEY_WRAPPER_SUITE.legacy;
    const digest = await hashSharedUnlockKeyContext(context);
    assertCurrent();
    if (digest !== expectedDigest) throw new Error("Shared unlock key commitment failed");
    ciphertext = fromBase64Url(context.encryptedPrivateKey, 4096);
    privateKey = await decryptWithKey(ciphertext, masterKey);
    assertCurrent();
    publicKey = await deriveRecipientPublicKey(memberKeySuiteId, privateKey);
    assertCurrent();
    if (toBase64Url(publicKey) !== context.publicKey) throw new Error("Shared unlock member key binding failed");
    assertCurrent();
    recovered = true;
    return { masterKey, privateKey, memberKeySuiteId };
  } finally {
    if (ciphertext) wipe(ciphertext);
    if (publicKey) wipe(publicKey);
    if (!recovered) {
      wipe(masterKey);
      if (privateKey) wipe(privateKey);
    }
  }
}
