import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEntriesListUi, usePersistedEntriesList } from './use-entries-list-ui'

beforeEach(() => {
  useEntriesListUi.setState({ search: {}, scrollTop: {} })
})

describe('usePersistedEntriesList', () => {
  it('persists search per vault and survives a remount', () => {
    const first = renderHook(() => usePersistedEntriesList('v1', true))
    act(() => first.result.current.setSearch('gmail'))
    expect(first.result.current.search).toBe('gmail')

    // A fresh mount (e.g. navigating into an entry and back) reads the same value.
    const remounted = renderHook(() => usePersistedEntriesList('v1', true))
    expect(remounted.result.current.search).toBe('gmail')
  })

  it('keeps search isolated between vaults', () => {
    const v1 = renderHook(() => usePersistedEntriesList('v1', true))
    const v2 = renderHook(() => usePersistedEntriesList('v2', true))
    act(() => v1.result.current.setSearch('only-v1'))

    expect(v1.result.current.search).toBe('only-v1')
    expect(v2.result.current.search).toBe('')
  })

  it('records scrollTop from the scroll handler', () => {
    const { result } = renderHook(() => usePersistedEntriesList('v1', true))
    act(() =>
      result.current.onScroll({
        currentTarget: { scrollTop: 420 },
      } as unknown as React.UIEvent<HTMLDivElement>),
    )
    expect(useEntriesListUi.getState().scrollTop['v1']).toBe(420)
  })
})
