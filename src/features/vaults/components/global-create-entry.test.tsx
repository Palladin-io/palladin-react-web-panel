import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MemberSyncStatus } from '../sync/member-sync-store'
import { GlobalCreateEntry } from './global-create-entry'

const state = vi.hoisted(() => ({
  status: 'ready' as MemberSyncStatus,
  vaults: [{ id: 'personal', name: 'Personal', syncStatus: 'ready' }, { id: 'work', name: 'Work', syncStatus: 'ready' }],
  retry: vi.fn(),
}));

vi.mock('../sync/member-vault-list', () => ({
  useMemberVaultList: (query: string) => ({
    status: state.status, allItems: state.vaults,
    items: state.vaults.filter((vault) => vault.name.toLowerCase().includes(query.toLowerCase())),
    retry: state.retry,
  }),
}));
vi.mock('../use-vault', () => ({ useVault: (id: string) => ({ data: state.vaults.find((vault) => vault.id === id) }) }));
vi.mock('./create-entry-modal', () => ({
  CreateEntryModal: ({ vault, onCreated }: { vault: { id: string }; onCreated: () => void }) =>
    <button onClick={onCreated}>Create in {vault.id}</button>,
}));
vi.mock('./create-vault-dialog', () => ({
  CreateVaultDialog: ({ onCreated }: { onCreated: () => void }) => <button onClick={onCreated}>Create first vault</button>,
}));

beforeEach(() => {
  state.status = 'ready';
  state.vaults = [{ id: 'personal', name: 'Personal', syncStatus: 'ready' }, { id: 'work', name: 'Work', syncStatus: 'ready' }];
  vi.clearAllMocks();
});

describe('global Entry creation Vault selection', () => {
  it('does not choose implicitly; search and explicit selection bind the existing form to that Vault', () => {
    const onClose = vi.fn();
    render(<GlobalCreateEntry onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Choose a vault' })).toBeInTheDocument();
    expect(screen.queryByText(/Create in/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Search vaults…'), { target: { value: 'work' } });
    expect(screen.queryByRole('button', { name: 'Personal' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create in work' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows retry for a partial failure and does not offer the failed Vault', () => {
    state.vaults[0].syncStatus = 'error';
    render(<GlobalCreateEntry onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Personal' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('returns to the selector if the selected Vault loses readiness', () => {
    const { rerender } = render(<GlobalCreateEntry onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    state.vaults[1].syncStatus = 'resetting';
    rerender(<GlobalCreateEntry onClose={vi.fn()} />);
    expect(screen.queryByText('Create in work')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Choose a vault' })).toBeInTheDocument();
  });

  it('keeps the selected form when a Vault rename no longer matches the picker search', () => {
    const { rerender } = render(<GlobalCreateEntry onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Search vaults…'), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    state.vaults[1].name = 'Renamed';
    rerender(<GlobalCreateEntry onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Create in work' })).toBeInTheDocument();
  });

  it('offers first-Vault creation only after an authoritative empty list', () => {
    state.vaults = [];
    state.status = 'syncing';
    const { rerender } = render(<GlobalCreateEntry onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Create vault' })).not.toBeInTheDocument();
    state.status = 'ready';
    rerender(<GlobalCreateEntry onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /create vault/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create first vault' }));
    expect(screen.getByRole('dialog', { name: 'Choose a vault' })).toBeInTheDocument();
  });
});
