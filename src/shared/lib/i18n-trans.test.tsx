import { render, screen } from '@testing-library/react'
import { Trans } from 'react-i18next'
import { describe, expect, it, vi } from 'vitest'

describe('rich translations', () => {
  it('does not forward react-i18next internal props to the DOM', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <Trans
        i18nKey="notifications.grantPending.body"
        values={{ agent: 'Bot', entry: 'Gmail', vault: 'Prod' }}
        components={{ b: <strong className="font-semibold" /> }}
      />,
    )

    const consoleOutput = consoleError.mock.calls.flat().join(' ')
    consoleError.mockRestore()

    expect(screen.getAllByText(/Bot|Gmail|Prod/)).toHaveLength(3)
    expect(consoleOutput).not.toContain('i18nIsDynamicList')
  })
})
