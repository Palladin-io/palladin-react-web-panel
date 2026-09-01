import { describe, expect, it } from 'vitest'
import { grantStatusPresentation } from './grant-presentation'

describe('grantStatusPresentation', () => {
  it('uses the known status presentation when available', () => {
    expect(grantStatusPresentation('active')).toMatchObject({
      labelKey: 'grants.statusActive',
      color: '#10B981',
    })
  })

  it('uses a neutral presentation for a forward-compatible status', () => {
    expect(grantStatusPresentation('suspending')).toEqual({
      labelKey: 'grants.statusUnknown',
      color: 'var(--cv-neutral)',
    })
  })
})
