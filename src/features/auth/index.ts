export { LoginPage } from './components/login-page'
export { RegisterPage } from './register/register-page'
export { VerifyEmailPage } from './verify-email/verify-email-page'
export { SecurityPage } from './security/security-page'
export { WaitlistDeveloperBenefitDialog } from './components/waitlist-developer-benefit-dialog'
export { isWaitlistDeveloperBenefitActive } from './lib/waitlist-developer-benefit'
export { useAuthStore, getIsAuthenticated } from './stores/auth-store'
export { useSessionTimeout } from './hooks/use-session-timeout'
export { prepareManualSharedUnlock } from './shared-unlock/manual-source'
export { beginManualUnlockAttempt } from './session/manual-unlock-attempt'
export {
  captureClientSessionGeneration,
  clearClientSession,
  clientSessionGenerationMatches,
  logoutAndReload,
} from './session/client-session'

export { SharedUnlockBrowserProvider } from './shared-unlock/browser-provider'
