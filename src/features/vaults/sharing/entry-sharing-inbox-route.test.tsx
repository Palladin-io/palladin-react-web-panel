import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Route } from '../../../routes/_authenticated/vaults_.$vaultId_.entries_.$entryId'

vi.mock('../index', () => ({ EntryDetailPage: ({ initialTab }: { initialTab?: string }) => <div>{initialTab ?? 'details'}</div> }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it.each(['sharing', undefined] as const)('passes the validated %s destination to the Entry detail', (tab) => {
  vi.spyOn(Route, 'useParams').mockReturnValue({ vaultId: 'vault', entryId: 'entry' })
  vi.spyOn(Route, 'useSearch').mockReturnValue({ tab })
  const Component = Route.options.component!
  render(<Component />)
  expect(screen.getByText(tab ?? 'details')).toBeInTheDocument()
})

it('accepts only the explicit sharing tab and discards unknown routing input', () => {
  const validate = Route.options.validateSearch as (input: Record<string, unknown>) => unknown
  expect(validate({ tab: 'sharing', url: 'https://untrusted.example', key: 'do-not-route' })).toEqual({ tab: 'sharing' })
  expect(validate({ tab: 'not-supported' })).toEqual({})
})
