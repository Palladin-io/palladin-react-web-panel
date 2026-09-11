import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { oauthGoogle } from '../api/auth-api'
import { useAuthStore } from '../stores/auth-store'

export function useLogin(redirectTo = '/') {
  const setTokens = useAuthStore((s) => s.setTokens)
  const navigate = useNavigate()

  return useMutation({
    mutationFn: oauthGoogle,
    onSuccess: (data) => {
      setTokens(data)
      if (data.isNewUser) {
        void navigate({ to: '/privacy-choices', search: { redirect: redirectTo } })
      } else {
        void navigate({ href: redirectTo })
      }
    },
  })
}
