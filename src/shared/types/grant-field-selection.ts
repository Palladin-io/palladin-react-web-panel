export type GrantFieldSelectionMode = 'all' | 'selected'

export type GrantFieldSelection =
  | { mode: 'all' }
  | { mode: 'selected'; fieldIds: string[] }
