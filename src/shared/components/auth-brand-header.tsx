import { AppWordmark } from './app-wordmark'
import { RotatingWelcome } from './rotating-welcome'

/** The same brand proportions and rhythm as the landing hero. */
export function AuthBrandHeader({ showWelcome = true }: { showWelcome?: boolean }) {
  return (
    <div className="auth-brand-header" data-welcome={showWelcome}>
      <AppWordmark size="hero" />
      {showWelcome ? <RotatingWelcome className="auth-brand-tagline" /> : null}
    </div>
  )
}
