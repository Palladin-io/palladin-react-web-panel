import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './login-page'

// Mock @react-oauth/google
vi.mock('@react-oauth/google', () => ({
  useGoogleLogin: () => vi.fn(),
}))

// Mock the useLogin hook
vi.mock('../hooks/use-login', () => ({
  useLogin: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
}))

describe('LoginPage', () => {
  it('renders without crashing', () => {
    render(<LoginPage />)
    expect(screen.getByRole('heading', { name: /claw\s*vault/i })).toBeInTheDocument()
  })

  it('renders Google login button', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeInTheDocument()
  })

  it('renders Google login button as enabled', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeEnabled()
  })

  it('renders Apple button as disabled', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /continue with apple/i }),
    ).toBeDisabled()
  })

  it('renders X button as disabled', () => {
    render(<LoginPage />)
    expect(
      screen.getByRole('button', { name: /continue with x/i }),
    ).toBeDisabled()
  })

  it('renders the tagline', () => {
    render(<LoginPage />)
    expect(
      screen.getByText(/zero-knowledge password manager/i),
    ).toBeInTheDocument()
  })

  it('renders the terms footer', () => {
    render(<LoginPage />)
    expect(
      screen.getByText(/by continuing, you agree to our/i),
    ).toBeInTheDocument()
  })
})
