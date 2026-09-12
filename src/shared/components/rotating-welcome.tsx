import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const WELCOME_MESSAGE_KEYS = [
  'auth.welcomeLine1',
  'auth.welcomeLine2',
  'auth.welcomeLine3',
  'auth.welcomeLine4',
]

export function RotatingWelcome({ className = 'mb-7' }: { className?: string }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let fadeTimeout: ReturnType<typeof setTimeout> | undefined
    const id = setInterval(() => {
      setVisible(false)
      fadeTimeout = setTimeout(() => {
        setIndex((prev) => (prev + 1) % WELCOME_MESSAGE_KEYS.length)
        setVisible(true)
      }, 350)
    }, 3800)
    return () => {
      clearInterval(id)
      clearTimeout(fadeTimeout)
    }
  }, [])

  return (
    <p
      className={`h-4 text-ui text-[var(--cv-auth-muted)] transition-opacity duration-300 ${className}`}
      style={{ opacity: visible ? 1 : 0 }}
    >
      {t(WELCOME_MESSAGE_KEYS[index])}
    </p>
  )
}

