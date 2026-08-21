import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResponsiveMasterDetail } from './responsive-master-detail'

describe('ResponsiveMasterDetail', () => {
  it('drills into the selected detail on a narrow viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    render(
      <ResponsiveMasterDetail
        master={<p>Master</p>}
        detail={<p>Detail</p>}
        hasSelection
        masterLabel="Master panel"
        detailLabel="Detail panel"
      />,
    )
    expect(screen.getByText('Detail')).toBeInTheDocument()
    expect(screen.queryByText('Master')).not.toBeInTheDocument()
  })

  it('shows both panels on a wide viewport', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1800 })
    render(
      <ResponsiveMasterDetail
        master={<p>Master</p>}
        detail={<p>Detail</p>}
        hasSelection={false}
        masterLabel="Master panel"
        detailLabel="Detail panel"
      />,
    )
    expect(screen.getByText('Master')).toBeInTheDocument()
    expect(screen.getByText('Detail')).toBeInTheDocument()
  })
})
