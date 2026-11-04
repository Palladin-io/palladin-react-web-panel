import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { EmergencyKitPanel } from './emergency-kit-panel'

const pdf = vi.hoisted(() => ({ create: vi.fn(), download: vi.fn() }))
vi.mock('../lib/emergency-kit-pdf', () => ({ createEmergencyKitPdf: pdf.create, downloadEmergencyKit: pdf.download }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const kit = { email: 'user@example.com', secretKey: 'PSK2-AAAAAA-BBBBBB', qrPayload: 'palladin-kit:v1:a.b' }

beforeEach(() => {
  pdf.create.mockReset().mockResolvedValue(new Blob(['%PDF']))
  pdf.download.mockReset()
})

it('keeps Continue disabled until the kit was downloaded and acknowledged', async () => {
  const onContinue = vi.fn()
  const user = userEvent.setup()
  render(<EmergencyKitPanel kit={kit} continueLabel="Continue" onContinue={onContinue} />)
  const finish = screen.getByRole('button', { name: /continue/i })
  const acknowledge = screen.getByRole('checkbox', { name: /saved my emergency kit/i })
  expect(finish).toBeDisabled()
  expect(acknowledge).toBeDisabled()

  await user.click(screen.getByRole('button', { name: /download emergency kit/i }))
  expect(pdf.create).toHaveBeenCalledWith(expect.objectContaining({
    email: kit.email, secretKey: kit.secretKey, qrPayload: kit.qrPayload, signInAddress: window.location.origin,
  }))
  expect(pdf.download).toHaveBeenCalledOnce()
  expect(finish).toBeDisabled()
  await user.click(acknowledge)
  await user.click(finish)
  expect(onContinue).toHaveBeenCalledOnce()
})

it('stays gated when the PDF cannot be created', async () => {
  pdf.create.mockRejectedValueOnce(new Error('canvas unavailable'))
  const user = userEvent.setup()
  render(<EmergencyKitPanel kit={kit} continueLabel="Continue" onContinue={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: /download emergency kit/i }))
  expect(screen.getByRole('checkbox', { name: /saved my emergency kit/i })).toBeDisabled()
  expect(pdf.download).not.toHaveBeenCalled()
})
