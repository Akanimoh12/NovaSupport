import { useEffect } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SupportPanel } from '@/components/support-panel';
import { signTransaction } from '@stellar/freighter-api';
import { buildSupportIntent, horizonServer } from '@/lib/stellar';

vi.mock('@stellar/freighter-api', () => ({
  getAddress: vi.fn(),
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => ({
  Asset: {
    native: vi.fn(() => ({ type: 'native' })),
  },
  BASE_FEE: '100',
  Horizon: {},
  Transaction: vi.fn(),
  FeeBumpTransaction: vi.fn(),
  TransactionBuilder: {
    fromXDR: vi.fn(() => ({ mocked: true })),
  },
}));

vi.mock('@/lib/config', () => ({
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  API_BASE_URL: 'http://localhost:4000',
  STELLAR_NETWORK: 'TESTNET',
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  CONTRACT_ID: '',
  SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
}));

vi.mock('@/lib/stellar', () => ({
  buildSupportIntent: vi.fn(),
  buildPathPaymentIntent: vi.fn(),
  getNetworkLabel: vi.fn(() => 'Testnet'),
  horizonServer: {
    submitTransaction: vi.fn(),
    loadAccount: vi.fn().mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '100.0000000' }],
    }),
    strictSendPaths: vi.fn(() => ({
      call: vi.fn().mockResolvedValue({ records: [] }),
    })),
  },
  stellarConfig: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    stellarNetwork: 'TESTNET',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
}));

vi.mock('./wallet-connect', () => ({
  WalletConnect: ({ onConnect }: { onConnect?: (address: string) => void }) => {
    useEffect(() => {
      onConnect?.('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    }, [onConnect]);
    return <div data-testid="wallet-connect-mock">WalletConnect Mock</div>;
  },
}));

const showToast = vi.fn();
vi.mock('@/lib/use-toast', () => ({
  useToast: () => ({ showToast }),
}));

describe('SupportPanel', () => {
  const mockProps = {
    walletAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    acceptedAssets: [{ code: 'XLM' }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('submits a signed transaction and shows the transaction hash', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(horizonServer.submitTransaction).mockResolvedValue({
      hash: '1234567890abcdef1234567890abcdef',
    } as never);

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() => expect(screen.getByText(/Support Sent!/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('12345678...90abcdef')).toBeInTheDocument();
    expect(screen.getByRole('article')).toMatchSnapshot();
  });

  it('shows "Waiting for Freighter signature…" while signing prompt is open', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    // Never resolves — simulates Freighter prompt staying open
    vi.mocked(signTransaction).mockReturnValue(new Promise(() => {}));

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Waiting for Freighter signature/i })).toBeDisabled(),
    );
  });

  it('shows a readable error when the user rejects the transaction in Freighter', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockRejectedValue(new Error('User declined signing the transaction'));

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() =>
      expect(screen.getByText('You declined the transaction in Freighter.')).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('shows a readable error when Freighter is not installed', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockRejectedValue(new Error('Freighter is not installed'));

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/Freighter is not installed/i),
      ).toBeInTheDocument(),
      { timeout: 3000 },
    );
  });

  it('shows a readable Horizon error message', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(horizonServer.submitTransaction).mockRejectedValue({
      response: { data: { extras: { result_codes: { transaction: 'tx_too_late' } } } },
    });

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() => expect(screen.getByText('Transaction expired')).toBeInTheDocument(), { timeout: 3000 });
  });

  it('button is disabled while the signing prompt is open', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockReturnValue(new Promise(() => {}));

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Waiting for Freighter signature/i });
      expect(btn).toBeDisabled();
    });
  });

  it('renders payment asset selector when connected', async () => {
    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Pay with')).toBeInTheDocument());
    expect(screen.getByText('Amount')).toBeInTheDocument();
  });

  it('shows empty wallet message when connected wallet has no balances', async () => {
    vi.mocked(horizonServer.loadAccount).mockResolvedValue({
      balances: [],
    } as never);

    render(<SupportPanel {...mockProps} />);
    await waitFor(() =>
      expect(
        screen.getByText('Your wallet has no supported assets. Fund your wallet to continue.'),
      ).toBeInTheDocument(),
    );
  });

  it('renders recurring support toggle', async () => {
    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Make it recurring')).toBeInTheDocument());
  });

  it('copies recipient address and shows feedback toast', async () => {
    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Recipient Address')).toBeInTheDocument());
    fireEvent.click(
      screen.getByRole('button', { name: /copy recipient address to clipboard/i }),
    );

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Recipient address copied!', 'success');
    });
  });

  it('supports Ctrl/Cmd+C on focused recipient address', async () => {
    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByText('Recipient Address')).toBeInTheDocument());
    const recipientAddress = screen.getByLabelText(/Recipient Stellar wallet address/i);
    recipientAddress.focus();
    fireEvent.keyDown(recipientAddress, { key: 'c', metaKey: true });

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Recipient address copied!', 'success');
    });
  });

  it('handles 409 duplicate transaction gracefully — shows success with existing hash', async () => {
    const horizonHash = 'aabbccdd11223344aabbccdd11223344';
    const existingHash = 'deadbeef12345678deadbeef12345678';

    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(horizonServer.submitTransaction).mockResolvedValue({
      hash: horizonHash,
    } as never);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: new Headers(),
      json: async () => ({ existingTxHash: existingHash }),
    } as Response);

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));

    await waitFor(
      () => expect(screen.getByText(/Support Sent!/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );

    expect(showToast).toHaveBeenCalledWith(
      'This transaction was already recorded',
      'success',
    );

    // The modal should display the existing hash, not the Horizon hash
    expect(screen.getByText(`${existingHash.slice(0, 8)}...${existingHash.slice(-8)}`)).toBeInTheDocument();
  });

  it('does not show an error panel when backend returns 409', async () => {
    vi.mocked(buildSupportIntent).mockResolvedValue('unsigned-xdr');
    vi.mocked(signTransaction).mockResolvedValue({
      signedTxXdr: 'signed-xdr',
      signerAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(horizonServer.submitTransaction).mockResolvedValue({
      hash: 'somehash1234567890abcdef12345678',
    } as never);

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 409,
      headers: new Headers(),
      json: async () => ({ existingTxHash: 'existinghash1234567890abcdef1234' }),
    } as Response);

    render(<SupportPanel {...mockProps} />);
    await waitFor(() => expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Send Support/i })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /Send Support/i }));

    await waitFor(
      () => expect(screen.getByText(/Support Sent!/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );

    // No error panel should be shown
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });
});
