import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { guardReceptionContinuation } from './reception-continuation'

export function EntryShareContinuationGuard() {
  const router = useRouter()
  useEffect(() => router.subscribe('onBeforeNavigate', ({ toLocation }) => {
    guardReceptionContinuation(toLocation.href)
  }), [router])
  return null
}
