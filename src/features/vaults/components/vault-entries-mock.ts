/**
 * Placeholder entry data for the vault detail Entries tab.
 *
 * Real entries land with CVT-9 (entry CRUD + zero-knowledge crypto). For
 * the CVT-30 design pass we use a fixed mock list so the design can be
 * reviewed end-to-end. Once the entry API + decryption flow exist, this
 * file gets removed and the component reads from `useEntries(vaultId)`.
 */

export type MockEntry =
  | {
      id: string
      type: 'key'
      name: string
      meta: string
      icon: string
      iconColor: string
      value: string
      url: string
    }
  | {
      id: string
      type: 'credential'
      name: string
      meta: string
      icon: string
      iconColor: string
      username: string
      password: string
      url: string
    }

export const MOCK_ENTRIES: MockEntry[] = [
  {
    id: 'mock-aws',
    type: 'key',
    name: 'AWS Access Key',
    meta: 'accessed 3m ago',
    icon: 'vpn_key',
    iconColor: '#2EC4B6',
    value: 'AKIAIOSFODNN7EXAMPLE',
    url: 'console.aws.amazon.com',
  },
  {
    id: 'mock-stripe',
    type: 'key',
    name: 'Stripe API Key',
    meta: 'accessed 1h ago',
    icon: 'payment',
    iconColor: '#2EC4B6',
    value: 'sk_live_51HxyzABCDEFG',
    url: 'dashboard.stripe.com',
  },
  {
    id: 'mock-github',
    type: 'credential',
    name: 'GitHub',
    meta: 'github.com',
    icon: 'code',
    iconColor: '#60A5FA',
    username: 'patryk@company.com',
    password: 'GitH0b!2026',
    url: 'github.com',
  },
  {
    id: 'mock-vercel',
    type: 'credential',
    name: 'Vercel Dashboard',
    meta: 'vercel.com',
    icon: 'rocket_launch',
    iconColor: '#60A5FA',
    username: 'patryk@vercel.com',
    password: 'V3rc3l#2026',
    url: 'vercel.com',
  },
  {
    id: 'mock-openai',
    type: 'key',
    name: 'OpenAI API Key',
    meta: 'accessed 2h ago',
    icon: 'psychology',
    iconColor: '#2EC4B6',
    value: 'sk-proj-aBcDeFgHiJkL',
    url: 'platform.openai.com',
  },
  {
    id: 'mock-supabase',
    type: 'credential',
    name: 'Supabase',
    meta: 'supabase.com',
    icon: 'storage',
    iconColor: '#60A5FA',
    username: 'patryk@company.com',
    password: 'Sup@b4se!2026',
    url: 'supabase.com',
  },
]
