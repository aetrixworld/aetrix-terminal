import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { TOKENS, type TokenInfo } from '../tokens';
import { PLATFORM_FEE_BPS, isDemoMode } from '../config';
import {
  buildSwapTransaction,
  getQuote,
  type QuoteResponse,
} from '../lib/jupiter';

/** Convert a human amount ("1.5") to smallest units as an integer string. */
function toBaseUnits(amount: string, decimals: number): string | null {
  if (!amount || isNaN(Number(amount))) return null;
  const [whole, frac = ''] = amount.split('.');
  const padded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  const raw = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
  return raw === '0' ? null : raw;
}

/** Convert smallest units back to a trimmed human-readable string. */
function fromBaseUnits(raw: string, decimals: number): string {
  const value = Number(raw) / 10 ** decimals;
  return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function TokenSelect({
  value,
  onChange,
  exclude,
}: {
  value: TokenInfo;
  onChange: (t: TokenInfo) => void;
  exclude: TokenInfo;
}) {
  return (
    <select
      value={value.symbol}
      onChange={(e) => {
        const t = TOKENS.find((x) => x.symbol === e.target.value);
        if (t) onChange(t);
      }}
    >
      {TOKENS.filter((t) => t.symbol !== exclude.symbol).map((t) => (
        <option key={t.symbol} value={t.symbol}>
          {t.symbol}
        </option>
      ))}
    </select>
  );
}

type Status =
  | { kind: 'idle' }
  | { kind: 'quoting' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }
  | { kind: 'swapping' }
  | { kind: 'sent'; signature: string };

export default function SwapCard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [inputToken, setInputToken] = useState<TokenInfo>(TOKENS[0]); // SOL
  const [outputToken, setOutputToken] = useState<TokenInfo>(TOKENS[1]); // USDC
  const [amount, setAmount] = useState('0.1');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const quoteSeq = useRef(0);

  const refreshQuote = useCallback(async () => {
    const base = toBaseUnits(amount, inputToken.decimals);
    if (!base) {
      setQuote(null);
      setStatus({ kind: 'idle' });
      return;
    }
    const seq = ++quoteSeq.current;
    setStatus({ kind: 'quoting' });
    try {
      const q = await getQuote({
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        amount: base,
      });
      if (seq !== quoteSeq.current) return; // stale response
      setQuote(q);
      setStatus({ kind: 'ready' });
    } catch (err) {
      if (seq !== quoteSeq.current) return;
      setQuote(null);
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Quote failed',
      });
    }
  }, [amount, inputToken, outputToken]);

  // Debounced live quoting.
  useEffect(() => {
    const t = setTimeout(refreshQuote, 400);
    return () => clearTimeout(t);
  }, [refreshQuote]);

  const flip = () => {
    setInputToken(outputToken);
    setOutputToken(inputToken);
    setQuote(null);
  };

  const routeSummary = useMemo(() => {
    if (!quote) return '';
    return quote.routePlan.map((r) => r.swapInfo.label).join(' → ');
  }, [quote]);

  const feeDisplay = useMemo(() => {
    if (!quote?.platformFee) return null;
    return `${fromBaseUnits(quote.platformFee.amount, outputToken.decimals)} ${outputToken.symbol}`;
  }, [quote, outputToken]);

  const executeSwap = async () => {
    if (!quote || !wallet.publicKey || !wallet.signTransaction) return;
    setStatus({ kind: 'swapping' });
    try {
      const { swapTransaction } = await buildSwapTransaction({
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toBase58(),
        // feeAccount is derived inside buildSwapTransaction from the
        // quote's output mint + the configured referral account.
      });
      const tx = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64'),
      );
      const signed = await wallet.signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        maxRetries: 2,
      });
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction(
        { signature, ...latest },
        'confirmed',
      );
      setStatus({ kind: 'sent', signature });
    } catch (err) {
      setStatus({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Swap failed',
      });
    }
  };

  const canSwap =
    !!quote && wallet.connected && !isDemoMode && status.kind !== 'swapping';

  return (
    <div className="swap-card">
      {isDemoMode && (
        <div className="demo-banner">
          <strong>Demo mode — quotes are live, swaps are disabled.</strong>
          <br />
          No referral account is configured yet, so there is nowhere to send
          the platform fee. Set a real <code>REFERRAL_ACCOUNT</code> (see
          README → GO-LIVE CHECKLIST) to enable execution.
        </div>
      )}

      <div className="field">
        <label>You pay</label>
        <div className="row">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <TokenSelect value={inputToken} onChange={setInputToken} exclude={outputToken} />
        </div>
      </div>

      <button className="flip" onClick={flip} aria-label="Flip tokens">
        ⇅
      </button>

      <div className="field">
        <label>You receive (estimated)</label>
        <div className="row">
          <input
            readOnly
            placeholder="0.0"
            value={
              quote ? fromBaseUnits(quote.outAmount, outputToken.decimals) : ''
            }
          />
          <TokenSelect value={outputToken} onChange={setOutputToken} exclude={inputToken} />
        </div>
      </div>

      {status.kind === 'quoting' && <p className="muted">Fetching best route…</p>}
      {status.kind === 'error' && <p className="error">{status.message}</p>}

      {quote && (
        <div className="details">
          <div>
            <span>Rate</span>
            <span>
              1 {inputToken.symbol} ≈{' '}
              {(
                Number(quote.outAmount) /
                10 ** outputToken.decimals /
                (Number(quote.inAmount) / 10 ** inputToken.decimals)
              ).toLocaleString('en-US', { maximumFractionDigits: 6 })}{' '}
              {outputToken.symbol}
            </span>
          </div>
          <div>
            <span>Price impact</span>
            <span>{Number(quote.priceImpactPct).toFixed(2)}%</span>
          </div>
          <div>
            <span>Route</span>
            <span>{routeSummary}</span>
          </div>
          <div className="fee-row">
            <span>Platform fee ({PLATFORM_FEE_BPS / 100}%)</span>
            <span>{feeDisplay ?? '—'}</span>
          </div>
        </div>
      )}

      {status.kind === 'sent' ? (
        <p className="success">
          Swap confirmed ✅{' '}
          <a
            href={`https://solscan.io/tx/${status.signature}`}
            target="_blank"
            rel="noreferrer"
          >
            View on Solscan
          </a>
        </p>
      ) : (
        <button
          className="swap-btn"
          disabled={!canSwap}
          onClick={executeSwap}
        >
          {!wallet.connected
            ? 'Connect wallet to swap'
            : isDemoMode
              ? 'Swap disabled in demo mode'
              : status.kind === 'swapping'
                ? 'Swapping…'
                : 'Swap'}
        </button>
      )}
    </div>
  );
}
