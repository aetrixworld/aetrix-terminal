/**
 * Central platform configuration.
 *
 * The platform fee is the whole business: every swap routed through this
 * terminal sends `PLATFORM_FEE_BPS` basis points of the swap's output token
 * to the platform's Jupiter referral account via Jupiter's referral /
 * platform-fee model. Module 2 (the Launch tab) takes a flat SOL creation
 * fee per token launch, paid to `PLATFORM_WALLET` in the launch transaction.
 *
 * Values can be overridden with environment variables (see .env.example):
 *   VITE_PLATFORM_FEE_BPS=50
 *   VITE_REFERRAL_ACCOUNT=<your Jupiter referral account>
 *   VITE_PLATFORM_WALLET=<platform owner's wallet>
 *   VITE_LAUNCH_FEE_SOL=0.05
 */
import { PublicKey } from '@solana/web3.js';

/**
 * Vite injects `import.meta.env` at build/dev time. Default to an empty
 * object anywhere else (e.g. Node scripts importing these modules directly)
 * so the fallbacks below apply.
 */
const env: Record<string, string | undefined> =
  (import.meta as { env?: Record<string, string | undefined> }).env ?? {};

/** Platform fee in basis points. 50 bps = 0.50%. Jupiter caps this at 255 bps. */
export const PLATFORM_FEE_BPS: number = Number(
  env.VITE_PLATFORM_FEE_BPS ?? 50,
);

/** Placeholder shipped with the starter. Replace with a real referral account to go live. */
export const REFERRAL_ACCOUNT_PLACEHOLDER = 'YOUR_REFERRAL_ACCOUNT_HERE';

/**
 * The platform's Jupiter referral account, created at https://referral.jup.ag
 * (Swap + Trigger). This is the referral ACCOUNT itself — a PDA owned by
 * Jupiter's referral program.
 *
 * It is NOT the value Jupiter's swap call takes as `feeAccount`: the fee
 * must land in the referral *token account* for the swap's output mint,
 * which is the associated token account owned by this referral account.
 * `getFeeAccountForMint` in src/lib/jupiter.ts derives that per-mint
 * address. The derived token accounts must also exist on-chain (created
 * from the referral dashboard) before a swap carrying a fee can settle.
 */
export const REFERRAL_ACCOUNT: string = (
  env.VITE_REFERRAL_ACCOUNT ?? '6VJdba2jVgKrpcZXwXMEUcYqzU2uwD3h2sFqw6BTxyJ5'
).trim();

/**
 * Demo mode: while REFERRAL_ACCOUNT is still the placeholder there is
 * nowhere real to send fees, so the app runs quote-only — quotes are live
 * and real, but swap execution is disabled and a banner explains why. This
 * keeps the starter safe to run and share before the go-live steps are
 * complete. A real referral account (the default above) turns demo mode OFF.
 */
export const isDemoMode: boolean =
  !REFERRAL_ACCOUNT || REFERRAL_ACCOUNT === REFERRAL_ACCOUNT_PLACEHOLDER;

/** Jupiter Swap API (lite tier — public, no API key required). */
export const JUPITER_API_BASE = 'https://lite-api.jup.ag/swap/v1';

/**
 * Solana RPC endpoint. The public mainnet-beta endpoint returns
 * 403 "Access forbidden" for browser sendTransaction calls from dApp
 * origins (hit live 2026-11-25), so the default is PublicNode's free
 * CORS-enabled public RPC. Swap in a dedicated RPC (Helius/Triton/etc.)
 * for production via VITE_SOLANA_RPC.
 */
export const SOLANA_RPC: string =
  env.VITE_SOLANA_RPC ?? 'https://solana-rpc.publicnode.com';

/**
 * Module 2 (Launchpad): the platform owner's wallet. The flat token-creation
 * fee is transferred here, in SOL, inside the same transaction that creates
 * the token — see src/lib/launch.ts. This is a public address, safe to ship
 * as a default; override with VITE_PLATFORM_WALLET.
 */
export const PLATFORM_WALLET: PublicKey = new PublicKey(
  (env.VITE_PLATFORM_WALLET ?? 'EEreSuo5dibxdc8uWG5hVwwckTnzUyRBLGkUbWt42JZi').trim(),
);

/** Flat creation fee per token launch, in SOL. Override with VITE_LAUNCH_FEE_SOL. */
export const LAUNCH_FEE_SOL: number = Number(env.VITE_LAUNCH_FEE_SOL ?? 0.05);
