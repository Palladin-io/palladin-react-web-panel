import { create } from 'zustand'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  userId: string | null
  isOnboarded: boolean
  permissions: number

  setTokens: (data: {
    accessToken: string
    refreshToken: string
    userId: string
    isOnboarded: boolean
    permissions?: number
  }) => void
  markOnboarded: () => void
  logout: () => void
}

const initialState = {
  accessToken: null,
  refreshToken: null,
  userId: null,
  isOnboarded: false,
  permissions: 0,
}

export const useAuthStore = create<AuthState>()((set) => ({
  ...initialState,

  setTokens: (data) =>
    set({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: data.userId,
      isOnboarded: data.isOnboarded,
      permissions: data.permissions ?? 0,
    }),

  markOnboarded: () => set({ isOnboarded: true }),

  logout: () => set(initialState),
}))

export function getIsAuthenticated() {
  return useAuthStore.getState().accessToken !== null
}
