import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import { requireSubmissionReviewer, validateSubmissionsSearch } from './submission-route'

describe('submission routes', () => {
  it('accepts only the trash view as search state', () => {
    expect(validateSubmissionsSearch({ view: 'trashed' })).toEqual({ view: 'trashed' })
    expect(validateSubmissionsSearch({ view: 'purged' })).toEqual({})
    expect(validateSubmissionsSearch({})).toEqual({})
  })

  it('sends members without GrantManage to the Inbox before any submission request', () => {
    useAuthStore.setState({ permissions: 0 })
    let thrown: unknown
    try { requireSubmissionReviewer() } catch (error) { thrown = error }
    expect(isRedirect(thrown)).toBe(true)
    useAuthStore.setState({ permissions: PERMISSION_GRANT_MANAGE })
    expect(() => requireSubmissionReviewer()).not.toThrow()
  })
})
