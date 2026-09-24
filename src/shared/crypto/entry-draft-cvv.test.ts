import { describe, expect, it } from 'vitest'
import { defaultAgentVisibilityPolicy, fromMemberSecret, toMemberSecret } from './entry-draft'
import { encodeMemberSecret, parseMemberSecret, projectMemberIndex, projectAgentDiscovery } from './vault-plaintext'
import { ENTRY_TYPE_CREDIT_CARD } from '../types/entry-type'

const payload = { type: ENTRY_TYPE_CREDIT_CARD, cardholderName: 'Test',
  cardNumber: '4242424242424242', expiryMonth: '12', expiryYear: '2030', cvv: '012' } as const

describe('card CVV editing', () => {
  it('preserves CVV through read/edit and removes its policy when cleared', () => {
    const secret = toMemberSecret({ label: 'Card', agentLabel: 'Card', type: ENTRY_TYPE_CREDIT_CARD,
      payload, policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDIT_CARD) })
    const opened = fromMemberSecret(parseMemberSecret(encodeMemberSecret(secret)))
    expect(opened.content).toMatchObject({ cvv: '012' })
    expect(secret.agentFieldAccess['creditCard.cvv']).toBe('never')
    expect(JSON.stringify(projectMemberIndex(secret))).not.toContain('012')
    expect(JSON.stringify(projectAgentDiscovery(secret))).not.toContain('012')
    const cleared = toMemberSecret({ label: 'Card', agentLabel: 'Card', type: ENTRY_TYPE_CREDIT_CARD,
      payload: { ...payload, cvv: undefined }, policy: opened.agentVisibilityPolicy })
    expect(parseMemberSecret(encodeMemberSecret(cleared)).content).not.toHaveProperty('cvv')
    expect(cleared.agentFieldAccess).not.toHaveProperty('creditCard.cvv')
  })
})
