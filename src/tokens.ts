export interface TokenInfo {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  logoURI: string;
  /**
   * SPL token program that owns this mint. Every token in the default list
   * uses the classic SPL Token program; a Token-2022 mint would instead use
   * TOKEN_2022_PROGRAM_ID. The fee-account derivation must use the mint's
   * own program or the derived ATA address is wrong.
   */
  tokenProgram: string;
  /**
   * Whether a Jupiter referral token account exists for this mint.
   * The referral dashboard's "Create Token Accounts" list has exactly 14
   * tokens (SOL, USDC, USDT, USDG, cbBTC, jlUSDC, ANT, SPCX, NVDAx, PUMP,
   * HYPE, USD1, ZEC, ETH). Of this app's list, SOL/USDC/USDT are on it.
   * A JUP referral token account was additionally created and verified
   * on-chain on 2026-11-25 (PDA 7PBUJJZW8PCkFx25Nbs6gUtgokKKMiCdG8q2SFfUNGi5),
   * so JUP is supported too. BONK and WIF have no referral token account,
   * so swaps paying out in those tokens run without a platform fee
   * (see buildSwapTransaction in src/lib/jupiter.ts).
   */
  referralFeeSupported: boolean;
}

/** Classic SPL Token program. */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** SPL Token-2022 program (no token in the default list uses it yet). */
export const TOKEN_2022_PROGRAM_ID =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

/** Default token list. Mints are the canonical mainnet addresses. */
export const TOKENS: TokenInfo[] = [
  {
    symbol: 'SOL',
    name: 'Solana',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    tokenProgram: TOKEN_PROGRAM_ID,
    referralFeeSupported: true,
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    tokenProgram: TOKEN_PROGRAM_ID,
    referralFeeSupported: true,
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    tokenProgram: TOKEN_PROGRAM_ID,
    referralFeeSupported: true,
  },
  {
    symbol: 'JUP',
    name: 'Jupiter',
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    decimals: 6,
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png',
    tokenProgram: TOKEN_PROGRAM_ID,
    referralFeeSupported: true,
  },
  {
    symbol: 'BONK',
    name: 'Bonk',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    decimals: 5,
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png',
    tokenProgram: TOKEN_PROGRAM_ID,
    referralFeeSupported: false,
  },
  {
    symbol: 'WIF',
    name: 'dogwifhat',
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    decimals: 6,
    logoURI:
      'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm/logo.png',
    tokenProgram: TOKEN_PROGRAM_ID,
    referralFeeSupported: false,
  },
];

/**
 * Token program for a mint. Mints in the default list use their recorded
 * program; anything else defaults to the classic SPL Token program.
 */
export function tokenProgramForMint(mint: string): string {
  return TOKENS.find((t) => t.mint === mint)?.tokenProgram ?? TOKEN_PROGRAM_ID;
}

/**
 * Whether a platform fee can be collected on swaps paying out in this
 * mint — i.e. whether a Jupiter referral token account can exist for it.
 * Unknown mints default to false: running without a fee beats failing
 * the swap.
 */
export function referralFeeSupportedForMint(mint: string): boolean {
  return TOKENS.find((t) => t.mint === mint)?.referralFeeSupported ?? false;
}
