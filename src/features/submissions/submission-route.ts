import { redirect } from '@tanstack/react-router'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'

export interface SubmissionsSearch {
  view?: 'trashed'
}

export function validateSubmissionsSearch(search: Record<string, unknown>): SubmissionsSearch {
  return search.view === 'trashed' ? { view: 'trashed' } : {}
}

/** Reviewing requires GrantManage; the backend remains authoritative for every request. */
export function requireSubmissionReviewer(): void {
  if ((useAuthStore.getState().permissions & PERMISSION_GRANT_MANAGE) === 0) {
    throw redirect({ to: '/inbox' })
  }
}
