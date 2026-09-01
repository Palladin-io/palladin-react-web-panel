import { describe, expect, it } from 'vitest'
import { grantStatusPresentation } from './org-grant-presentation'

describe('org grantStatusPresentation', () => {
  it('uses a neutral presentation for a forward-compatible status', () => {
    expect(grantStatusPresentation('suspending')).toEqual({
      labelKey: 'grants.statusUnknown',
      color: 'var(--cv-neutral)',
      bg: 'rgb(var(--cv-neutral-rgb) / 0.14)',
    })
  })
})
