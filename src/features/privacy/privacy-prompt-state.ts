// Prompt dismissal is session UI state, never consent or analytics authority.
export const dismissedPrivacyAccounts = new Set<string>()
export function dismissPrivacyPrompt(userId: string | null) { if (userId) dismissedPrivacyAccounts.add(userId) }

