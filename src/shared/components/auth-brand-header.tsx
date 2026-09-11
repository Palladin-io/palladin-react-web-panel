import { AppWordmark } from './app-wordmark'
import { RotatingWelcome } from './rotating-welcome'

/** The same brand proportions and rhythm as the landing hero. */
export function AuthBrandHeader() {
  return (
    <div className="auth-brand-header">
      <AppWordmark size="hero" />
      <RotatingWelcome className="auth-brand-tagline" />
    </div>
  )
}
