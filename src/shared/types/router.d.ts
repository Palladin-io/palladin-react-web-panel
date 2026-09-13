import '@tanstack/react-router'

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** Opt in only on routes whose guards require an account session. */
    consentSession?: boolean
  }
}
