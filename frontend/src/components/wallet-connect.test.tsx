import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WalletConnect } from '@/components/wallet-connect';

// Mock @stellar/freighter-api
vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
}));

// Mock @/lib/config
vi.mock('@/lib/config', () => ({
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  API_BASE_URL: 'http://localhost:4000',
  STELLAR_NETWORK: 'TESTNET',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  CONTRACT_ID: '',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
}));

import { getAddress, isAllowed, setAllowed } from '@stellar/freighter-api';

describe('WalletConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset window.stellarLumens mock
    (window as any).stellarLumens = true;
  });

  it('renders connect button when disconnected', () => {
    const { container } = render(<WalletConnect />);
    
    expect(screen.getByText('Wallet')).toBeInTheDocument();
    expect(screen.getByText('Connect Freighter to preview Stellar Testnet support.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Freighter' })).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('shows address when connected', async () => {
    const mockAddress = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    
    (isAllowed as any).mockResolvedValue({ isAllowed: true });
    (getAddress as any).mockResolvedValue({ address: mockAddress, error: null });

    render(<WalletConnect />);
    
    const button = screen.getByRole('button', { name: 'Connect Freighter' });
    fireEvent.click(button);

    // Wait for async operations
    await waitFor(() => {
      expect(screen.getByText(/Connected address:/)).toBeInTheDocument();
    });
    expect(screen.getByText(/GAAAAA/)).toBeInTheDocument();
  });

  it('shows install prompt with link when Freighter is not available', async () => {
    (window as any).stellarLumens = undefined;
    
    render(<WalletConnect />);
    
    const button = screen.queryByRole('button', { name: 'Connect Freighter' });
    fireEvent.click(button!);

    await waitFor(() => {
      expect(screen.getByText(/Freighter wallet required/)).toBeInTheDocument();
    });
    
    const installLink = screen.getByRole('link', { name: /Install Freighter/i });
    expect(installLink).toBeInTheDocument();
    expect(installLink).toHaveAttribute('href', 'https://freighter.app');
    expect(installLink).toHaveAttribute('target', '_blank');
    expect(installLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not render connect button when Freighter is not installed', async () => {
    (window as any).stellarLumens = undefined;
    
    render(<WalletConnect />);
    
    const button = screen.getByRole('button', { name: 'Connect Freighter' });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Freighter wallet required/)).toBeInTheDocument();
    });
    
    // Button should not be visible after detecting Freighter is not installed
    expect(screen.queryByRole('button', { name: 'Connect Freighter' })).not.toBeInTheDocument();
  });
});
