import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VaultIconCircle } from './vault-icon-circle'
const asset = vi.hoisted(() => vi.fn())
vi.mock('../assets/use-vault-encrypted-asset-url', () => ({ useVaultEncryptedAssetUrl: asset }))
describe('Vault custom icon rendering', () => {
  it('resolves the encrypted asset in its Vault and renders only the decrypted object URL', () => {
    asset.mockReturnValue({ url: 'blob:decrypted', corrupt: false })
    const { container, rerender } = render(<VaultIconCircle vaultId="vault-1" icon="vault-asset:33332233-4455-4677-8899-aabbccddeeff" color="#123456" />)
    expect(asset).toHaveBeenCalledWith('vault-1', '33332233-4455-4677-8899-aabbccddeeff')
    expect(container.querySelector('img')).toHaveAttribute('src', 'blob:decrypted')
    asset.mockReturnValue({ url: null, corrupt: true })
    rerender(<VaultIconCircle vaultId="vault-1" icon="vault-asset:33332233-4455-4677-8899-aabbccddeeff" color="#123456" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
