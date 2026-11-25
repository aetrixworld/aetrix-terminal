import { useMemo, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAUNCH_FEE_SOL, PLATFORM_WALLET } from '../config';
import { buildLaunchTransaction } from '../lib/launch';

/** Format an integer string with thousands separators (exact at any size). */
function formatIntegerString(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

type Status =
  | { kind: 'idle' }
  | { kind: 'launching' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; mint: string; signature: string };

export default function LaunchCard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState(9);
  const [supply, setSupply] = useState('1000000000');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [revokeMintAuthority, setRevokeMintAuthority] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const formValid = useMemo(() => {
    if (name.trim().length === 0 || name.trim().length > 32) return false;
    if (symbol.trim().length === 0 || symbol.trim().length > 10) return false;
    if (!/^\d+$/.test(supply) || BigInt(supply) <= 0n) return false;
    return true;
  }, [name, symbol, supply]);

  const executeLaunch = async () => {
    if (!wallet.publicKey || !formValid) return;
    setStatus({ kind: 'launching' });
    try {
      const built = await buildLaunchTransaction(
        connection,
        wallet.publicKey,
        {
          name: name.trim(),
          symbol: symbol.trim(),
          uri: imageUrl.trim(),
          description: description.trim() || undefined,
          decimals,
          supply,
          revokeMintAuthority,
        },
      );
      const signature = await wallet.sendTransaction(
        built.transaction,
        connection,
        { signers: [built.mintKeypair] },
      );
      await connection.confirmTransaction(
        {
          signature,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.lastValidBlockHeight,
        },
        'confirmed',
      );
      setStatus({
        kind: 'success',
        mint: built.mint.toBase58(),
        signature,
      });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Launch failed',
      });
    }
  };

  const canLaunch =
    wallet.connected && formValid && status.kind !== 'launching';

  return (
    <div className="swap-card launch-card">
      <div className="field">
        <label>Token name</label>
        <input
          type="text"
          placeholder="e.g. Aetrix World Token"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Symbol</label>
        <input
          type="text"
          placeholder="e.g. AETRIX"
          maxLength={10}
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Decimals</label>
        <select
          value={decimals}
          onChange={(e) => setDecimals(Number(e.target.value))}
        >
          <option value={9}>9 (like SOL)</option>
          <option value={6}>6 (like USDC)</option>
          <option value={0}>0 (whole tokens only)</option>
        </select>
      </div>

      <div className="field">
        <label>Total supply</label>
        <input
          type="text"
          inputMode="numeric"
          placeholder="1000000000"
          value={supply}
          onChange={(e) => setSupply(e.target.value.replace(/[^0-9]/g, ''))}
        />
      </div>

      <div className="field">
        <label>Image URL (optional)</label>
        <input
          type="text"
          placeholder="https://…/token-image.png"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Description (optional)</label>
        <textarea
          rows={2}
          placeholder="What is this token for?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={revokeMintAuthority}
          onChange={(e) => setRevokeMintAuthority(e.target.checked)}
        />
        <span>Revoke mint authority — fixed supply forever</span>
      </label>

      <div className="details">
        <div className="fee-row">
          <span>Platform creation fee</span>
          <span>{LAUNCH_FEE_SOL} SOL</span>
        </div>
        <div>
          <span>Fee goes to</span>
          <span className="mono-sm">{PLATFORM_WALLET.toBase58()}</span>
        </div>
        <div>
          <span>Network + mint rent</span>
          <span>Paid by your wallet</span>
        </div>
        <div>
          <span>You receive</span>
          <span>
            {supply ? formatIntegerString(supply) : '0'}{' '}
            {symbol.trim() || 'tokens'} in your wallet
          </span>
        </div>
      </div>
      <p className="muted">
        The creation fee is paid inside the same transaction that creates
        the token — if the launch fails, no fee is taken. The mint rent is
        locked in the token's account on Solana, not paid to the platform.
      </p>

      {status.kind === 'error' && <p className="error">{status.message}</p>}

      {status.kind === 'success' ? (
        <div className="success-panel">
          <p className="success">Token launched ✅</p>
          <p className="mint-address">
            Mint address
            <br />
            <code>{status.mint}</code>
          </p>
          <p>
            <a
              href={`https://solscan.io/token/${status.mint}`}
              target="_blank"
              rel="noreferrer"
            >
              View token on Solscan
            </a>
            {' · '}
            <a
              href={`https://solscan.io/tx/${status.signature}`}
              target="_blank"
              rel="noreferrer"
            >
              View transaction
            </a>
          </p>
          <p className="muted">
            Your token now exists on-chain and the full supply is in your
            wallet. It is <strong>not tradable yet</strong> — it becomes
            tradable once you add liquidity, e.g. by creating a pool on
            Raydium. Once a Jupiter referral fee account exists for this
            mint (create one at{' '}
            <a href="https://referral.jup.ag" target="_blank" rel="noreferrer">
              referral.jup.ag
            </a>
            ), swaps of this token routed through this terminal's Swap tab
            can also earn the platform fee.
          </p>
        </div>
      ) : (
        <button
          className="swap-btn"
          disabled={!canLaunch}
          onClick={executeLaunch}
        >
          {!wallet.connected
            ? 'Connect wallet to launch'
            : status.kind === 'launching'
              ? 'Launching…'
              : 'Launch token'}
        </button>
      )}
    </div>
  );
}
