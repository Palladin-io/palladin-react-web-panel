import { isFirefoxSharedUnlockExtensionId } from '../src/shared/lib/shared-unlock-extension-id'

/** Firefox assigns a per-installation moz-extension origin. Only configured
 * deployments permit that scheme for fetch/frames; runtime pins exact canonical
 * ID plus browser origin/source. Scripts never receive this scheme permission. */
export function firefoxSharedUnlockCsp(extensionId: string | undefined): string {
  if (!extensionId) return ''
  if (!isFirefoxSharedUnlockExtensionId(extensionId)) throw new Error('Invalid VITE_SHARED_UNLOCK_FIREFOX_EXTENSION_ID')
  return 'moz-extension:'
}
