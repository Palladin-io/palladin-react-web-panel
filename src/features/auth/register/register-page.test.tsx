import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { RegisterPage } from './register-page'

const SAMPLE_WORDS = [
  'alpha',
  'bravo',
  'charlie',
  'delta',
  'echo',
  'foxtrot',
  'golf',
  'hotel',
  'india',
  'juliet',
  'kilo',
  'lima',
  'mike',
  'nova',
  'oscar',
  'papa',
  'quebec',
  'romeo',
  'sierra',
  'tango',
  'ultra',
  'victor',
  'whisky',
  'xray',
]

const navigateMock = vi.hoisted(() => vi.fn())
const registerState = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to, search, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; search?: { redirect?: string } }) => (
    <a {...props} href={to + (search?.redirect ? `?redirect=${encodeURIComponent(search.redirect)}` : '')}>{children}</a>
  ),
}))
vi.mock('../hooks/use-register', () => ({ useRegister: () => registerState }))
vi.mock('../../../shared/lib/mnemonic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../shared/lib/mnemonic')>()
  return { ...actual, generateRecoveryMnemonic: () => SAMPLE_WORDS }
})
vi.mock('../../../shared/lib/hibp', () => ({
  checkPasswordPwned: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../../shared/lib/analytics', () => ({
  analytics: { capture: vi.fn() },
}))
beforeEach(() => {
  navigateMock.mockReset()
  registerState.mutate.mockReset()
  registerState.isPending = false
})

async function reachRecoveryConfirmation(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^email$/i), 'user@example.com')
  await user.type(screen.getByLabelText(/^master password$/i), 'StrongPass123!')
  await user.type(screen.getByLabelText(/^confirm master password$/i), 'StrongPass123!')
  await user.click(screen.getByRole('button', { name: /^continue$/i }))

  expect(await screen.findByRole('button', { name: /saved my recovery key/i })).toBeEnabled()
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /saved my recovery key/i }))

  const inputs = await screen.findAllByLabelText(/^word #\d+$/i)
  expect(inputs).toHaveLength(3)
  return inputs
}

async function enterRequestedWords(
  user: ReturnType<typeof userEvent.setup>,
  inputs: HTMLElement[],
) {
  for (const input of inputs) {
    const index = Number(input.id.replace('recovery-word-', ''))
    await user.type(input, SAMPLE_WORDS[index])
  }
}

it('requires recovery words and resumes normal auth guards after registration', async () => {
  registerState.mutate.mockImplementation((_input: unknown, options: { onSuccess: () => void }) => options.onSuccess())
  const user = userEvent.setup()
  render(<RegisterPage />)

  const inputs = await reachRecoveryConfirmation(user)
  await enterRequestedWords(user, inputs)

  await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))

  expect(registerState.mutate).toHaveBeenCalledWith(
    {
      email: 'user@example.com',
      masterPassword: 'StrongPass123!',
      recoveryMnemonic: SAMPLE_WORDS,
    },
    expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
  )
  expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
})

it('shows the registration error on the recovery confirmation step', async () => {
  registerState.mutate.mockImplementation(
    (_input: unknown, options: { onError: (error: Error) => void }) => {
      options.onError(new Error('Registration failed'))
    },
  )
  const user = userEvent.setup()
  render(<RegisterPage />)

  const inputs = await reachRecoveryConfirmation(user)
  await enterRequestedWords(user, inputs)
  await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    /couldn't create your account/i,
  )
})

it('returns to a clean sharing route after registration and preserves it when switching to login', async () => {
  registerState.mutate.mockImplementation((_input: unknown, options: { onSuccess: () => void }) => options.onSuccess())
  const user = userEvent.setup()
  const destination = '/share/00112233-4455-4677-8899-aabbccddeeff'
  render(<RegisterPage redirectTo={`${destination}?access=synthetic#key=synthetic`} />)
  expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', `/login?redirect=${encodeURIComponent(destination)}`)
  const inputs = await reachRecoveryConfirmation(user)
  await enterRequestedWords(user, inputs)
  await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))
  expect(navigateMock).toHaveBeenCalledWith({ href: destination })
})

it('never forwards an external return through registration or its login link', async () => {
  registerState.mutate.mockImplementation((_input: unknown, options: { onSuccess: () => void }) => options.onSuccess())
  const user = userEvent.setup()
  render(<RegisterPage redirectTo="https://attacker.example/" />)
  expect(screen.getByRole('link', { name: /^sign in$/i })).toHaveAttribute('href', '/login')
  const inputs = await reachRecoveryConfirmation(user)
  await enterRequestedWords(user, inputs)
  await user.click(screen.getByRole('button', { name: /verify & complete setup/i }))
  expect(navigateMock).toHaveBeenCalledWith({ to: '/' })
})
