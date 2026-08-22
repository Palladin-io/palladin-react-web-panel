export { LoginPage } from './components/login-page'
export { RegisterPage } from './register/register-page'
export { VerifyEmailPage } from './verify-email/verify-email-page'
export { SecurityPage } from './security/security-page'
export { useAuthStore, getIsAuthenticated } from './stores/auth-store'
export { useSessionTimeout } from './hooks/use-session-timeout'
export {
  authenticatedQueryKey,
  authenticatedQueryKeyForSession,
  useAuthenticatedQueryKey,
} from './session/authenticated-query-key'
export {
  useAuthenticatedMutation,
  type AuthenticatedMutationContext,
} from './session/use-authenticated-mutation'
export {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  expireAuthenticatedSession,
  markEmailVerifiedForSession,
  markOnboardedForSession,
  replaceAuthenticatedSession,
  StaleAuthenticatedSessionError,
  terminateAuthenticatedSession,
  unlockVaultForSession,
  type AuthenticatedSessionSnapshot,
} from './session/session-boundary'
