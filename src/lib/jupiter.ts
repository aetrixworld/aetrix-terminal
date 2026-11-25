import { PublicKey } from '@solana/web3.js';
import { JUPITER_API_BASE, PLATFORM_FEE_BPS, REFERRAL_ACCOUNT } from '../config';
import { referralFeeSupportedForMint } from '../tokens';

/** Subset of Jupiter's quote response that the UI uses. */
export interface QuoteResponse {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: Array<{
    swapInfo: {
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  platformFee?: {
    amount: string;
    feeBps: number;
  } | null;
  [key: string]: unknown;
}

export interface SwapTransactionResponse {
  swapTransaction: string; // base64-encoded VersionedTransaction
  lastValidBlockHeight: number;
}

/**
 * Fetch a live quote from Jupiter.
 *
 * `platformFeeBps` is passed on the quote so Jupiter prices the platform fee
 * into the route and returns the exact fee in `quote.platformFee` — but
 * ONLY when the output mint can have a referral token account (see
 * `referralFeeSupportedForMint`). For unsupported output mints (JUP, BONK,
 * WIF) the fee is skipped entirely: Jupiter requires a feeAccount at swap
 * build time whenever the quote carries a platform fee, and no such
 * account can exist for those mints, so quoting a fee would make the
 * swap unbuildable.
 */
export async function getQuote(params: {
  inputMint: string;
  outputMint: string;
  /** Amount in the input token's smallest units (lamports-style integer string). */
  amount: string;
  slippageBps?: number;
}): Promise<QuoteResponse> {
  const url = new URL(`${JUPITER_API_BASE}/quote`);
  url.searchParams.set('inputMint', params.inputMint);
  url.searchParams.set('outputMint', params.outputMint);
  url.searchParams.set('amount', params.amount);
  url.searchParams.set('slippageBps', String(params.slippageBps ?? 50));
  if (PLATFORM_FEE_BPS > 0 && referralFeeSupportedForMint(params.outputMint)) {
    url.searchParams.set('platformFeeBps', String(PLATFORM_FEE_BPS));
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jupiter quote failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as QuoteResponse;
}

/**
 * Derive the `feeAccount` for a swap with the given OUTPUT mint: the
 * referral token account for that mint — i.e. the associated token account
 * owned by the referral account, under the mint's own token program.
 *
 * The referral account is a PDA (off-curve), hence `allowOwnerOffCurve`.
 * Native SOL output is handled the same way as every other mint: the
 * output mint is the wrapped-SOL mint (So111…112), so this derives the
 * referral account's wSOL ATA, which is exactly where Jupiter pays
 * SOL-denominated fees.
 *
 * Note the derived account must exist on-chain (created from the referral
 * dashboard) or Jupiter's swap build will reject it.
 */
/**
 * Jupiter referral token accounts are NOT standard ATAs. The referral
 * program creates them as PDAs of the Referral program itself, derived
 * with seeds ["referral_ata", referralAccount, mint].
 *
 * Verified on-chain 2026-11-25: the USDC referral token account created
 * via referral.jup.ag for referral account 6VJd...xyJ5 lives at the PDA
 * 2jxHtH3KjuVP1CysBjVX8DuJcyiWNxVsLNhtSFvsTN5c (owned by the classic SPL
 * Token program), while the ATA derivation for the same mint does not
 * exist. Pointing Jupiter's feeAccount at the ATA makes wallets reject
 * the swap (the fee destination cannot exist there).
 */
export const REFERRAL_PROGRAM_ID = new PublicKey(
  'REFER4ZgmyYx9c6He5XfaTMiGfdLwRnkV4RPp9t9iF3',
);

export function getFeeAccountForMint(
  outputMint: string,
  referralAccount: string = REFERRAL_ACCOUNT,
): string {
  const [feeAccount] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('referral_ata'),
      new PublicKey(referralAccount).toBuffer(),
      new PublicKey(outputMint).toBuffer(),
    ],
    REFERRAL_PROGRAM_ID,
  );
  return feeAccount.toBase58();
}

/**
 * Build an executable swap transaction from a quote.
 *
 * When the quote's OUTPUT mint supports referral fees, the `feeAccount`
 * sent to Jupiter is derived per swap from that mint (see
 * `getFeeAccountForMint`) — Jupiter's referral model pays the fee in the
 * output token, so the destination must be the referral token account for
 * that mint, not the referral account itself.
 *
 * When the output mint does NOT support referral fees (JUP, BONK, WIF —
 * the referral dashboard cannot create token accounts for them), the swap
 * is built WITHOUT a platform fee: `feeAccount` is omitted rather than
 * pointing Jupiter at an account that can never exist, which would fail
 * the build. `getQuote` likewise omits `platformFeeBps` for those mints,
 * so the quote the user sees carries no fee either.
 *
 * Callers must not invoke this in demo mode — without a real referral
 * account the fee has nowhere to go.
 */
export async function buildSwapTransaction(params: {
  quoteResponse: QuoteResponse;
  userPublicKey: string;
  /** Referral account the fee token accounts belong to. Defaults to config. */
  referralAccount?: string;
}): Promise<SwapTransactionResponse> {
  const feeSupported = referralFeeSupportedForMint(
    params.quoteResponse.outputMint,
  );
  const feeAccount = feeSupported
    ? getFeeAccountForMint(
        params.quoteResponse.outputMint,
        params.referralAccount ?? REFERRAL_ACCOUNT,
      )
    : undefined;
  const res = await fetch(`${JUPITER_API_BASE}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: params.quoteResponse,
      userPublicKey: params.userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      // --- Platform fee wiring -------------------------------------------
      // When the output mint supports referral fees, feeAccount is the
      // referral token account for that mint (derived above) and Jupiter
      // moves the fee slice into it atomically, inside the same
      // transaction as the user's swap. For unsupported output mints it
      // is omitted entirely — the swap runs with no platform fee.
      ...(feeAccount ? { feeAccount } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Jupiter swap build failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as SwapTransactionResponse;
}
