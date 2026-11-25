# Fee Terminal — Solana Swap Terminal with Platform Fees

Module 1 of the crypto fee platform: a **non-custodial Solana swap terminal**
in the style of Axiom / Jupiter terminals. Users connect their own wallet
(Phantom / Solflare), get best-route quotes from the Jupiter aggregator, and
sign swaps themselves — the app never holds user funds.

The business is the fee: **every swap routed through this terminal pays a
small platform fee (default 0.5%) to the platform's fee account**, collected
automatically on-chain inside the same transaction as the user's swap. Revenue
starts the moment volume starts — no custody, no order book, no inventory.

## How the fee model works

Jupiter (the aggregator doing the actual routing) supports a
**referral / platform-fee model** for integrators:

1. **Quote** — the app calls Jupiter's quote API with `platformFeeBps`
   (e.g. `50` = 0.50%). Jupiter prices the fee into the route and returns the
   exact fee amount in the quote response (`platformFee.amount`), which the
   UI shows to the user before they sign.
2. **Swap build** — the app calls Jupiter's swap API with the quote plus
   `feeAccount`: the platform's *referral token account* for the swap's
   output token, derived in code as the associated token account owned by
   the referral account for that mint (see `getFeeAccountForMint` in
   `src/lib/jupiter.ts`).
3. **Settlement** — the user signs one transaction. Jupiter's program moves
   the swap output to the user and the fee slice to the fee account,
   atomically. If the swap fails, no fee is taken.

Key facts:

- The fee is charged in the **output token** of each swap.
- Jupiter caps platform fees at **255 bps (2.55%)**.
- Fees land in referral token accounts you control and can be claimed /
  withdrawn through Jupiter's referral dashboard.
- Jupiter keeps nothing extra from the integrator for this — the fee is
  yours; it's simply carved out of the swap output the user sees quoted.
- **Not every token can carry a fee.** The referral dashboard can only
  create referral token accounts for 14 tokens (SOL, USDC, USDT, USDG,
  cbBTC, jlUSDC, ANT, SPCX, NVDAx, PUMP, HYPE, USD1, ZEC, ETH). Of this
  app's token list, SOL, USDC and USDT are supported; **JUP, BONK and WIF
  are not** — no referral token account can exist for them. Swaps paying
  out in an unsupported token therefore run **without a platform fee**
  (the quote omits `platformFeeBps` and the swap build omits
  `feeAccount`) instead of failing against a nonexistent fee account.
  This is per-token config: `referralFeeSupported` in `src/tokens.ts`.

Configuration lives in [`src/config.ts`](src/config.ts) and can be
overridden with environment variables (see [`.env.example`](.env.example)):

| Setting              | Env var                 | Default              |
| -------------------- | ----------------------- | -------------------- |
| Platform fee         | `VITE_PLATFORM_FEE_BPS` | `50` (0.50%)         |
| Referral account     | `VITE_REFERRAL_ACCOUNT` | `6VJdba2jVgKrpcZXwXMEUcYqzU2uwD3h2sFqw6BTxyJ5` |
| Solana RPC           | `VITE_SOLANA_RPC`       | public mainnet RPC   |
| Platform wallet      | `VITE_PLATFORM_WALLET`  | `EEreSuo5dibxdc8uWG5hVwwckTnzUyRBLGkUbWt42JZi` |
| Launch creation fee  | `VITE_LAUNCH_FEE_SOL`   | `0.05` SOL           |

## Module 2 — Launchpad (Launch tab)

The **Launch** tab lets a connected wallet create a brand-new Solana token
in a single transaction — and that same transaction pays the platform a
flat **creation fee of 0.05 SOL** (`LAUNCH_FEE_SOL`) to the platform wallet
(`PLATFORM_WALLET`). If the launch fails, the fee is not taken; the two are
atomic.

How it works (see `src/lib/launch.ts`):

- The token is a **Token-2022** mint with the **MetadataPointer** and
  **TokenMetadata** extensions, so the name, symbol, image URI, and
  optional description live **on-chain**, in the mint account itself — no
  separate Metaplex metadata account, no off-chain JSON required.
- The full supply is minted to the creator's wallet in the same
  transaction. A checked-by-default option revokes the mint authority in
  that transaction, fixing the supply forever.
- The creator also pays the Solana network fee and the rent-exempt deposit
  for the mint account (locked in the account on-chain, not paid to the
  platform).

**Liquidity caveat:** a launched token exists on-chain with its supply in
the creator's wallet, but it is **not tradable** until the creator adds
liquidity (e.g. a Raydium pool). After that, swaps of the token routed
through this terminal's Swap tab can earn the swap platform fee too, once a
Jupiter referral fee account has been created for that mint at
[referral.jup.ag](https://referral.jup.ag).

## Demo mode

While `REFERRAL_ACCOUNT` is still the placeholder
(`YOUR_REFERRAL_ACCOUNT_HERE`), the app runs in **demo mode**: quotes are
100% live and real (including the fee amount that *would* be charged), but
the Swap button is disabled and a banner explains why. There is nowhere
real to send the fee yet, and silently dropping it would misprice every
trade — so execution waits for a real referral account. The live referral
account is now the default in `src/config.ts`, so demo mode is OFF;
complete the remaining go-live checklist items below before taking users.

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the build locally
```

## Project layout

```
src/
  config.ts               Fee %, referral account, demo-mode detection, endpoints
  tokens.ts               Default token list (SOL, USDC, USDT, JUP, BONK, WIF)
  lib/jupiter.ts          Jupiter quote + swap-build API calls (fee wiring)
  lib/launch.ts           Launchpad: Token-2022 mint + metadata + supply + fee tx builder
  components/SwapCard.tsx Swap UI: amounts, quote details, fee display, execute
  components/LaunchCard.tsx Launch UI: token form, creation-fee display, execute
  App.tsx                 Page shell + wallet connect button
  main.tsx                Wallet-adapter providers (Phantom / Solflare)
```

## GO-LIVE CHECKLIST — steps only Keison can do

The code is ready; these steps involve accounts, keys, and legal exposure
that must stay in Keison's hands:

- [ ] **Create a Solana wallet for fee collection.** Use a fresh wallet
      (Phantom or a hardware wallet) dedicated to platform revenue.
      **Never share the seed phrase with anyone — including in chat, email,
      or this repo.** Whoever has the seed phrase owns the fees.
- [x] **Register with Jupiter's referral program** at
      [referral.jup.ag](https://referral.jup.ag). **Done** — referral
      account (Swap + Trigger) created:
      **`6VJdba2jVgKrpcZXwXMEUcYqzU2uwD3h2sFqw6BTxyJ5`**, wired into
      `src/config.ts` as the default `REFERRAL_ACCOUNT` (demo mode off,
      fee still 50 bps). The app derives each swap's fee account from
      this address per output mint.
- [ ] **Create the referral token accounts — REMAINING, Keison's step.**
      In the referral dashboard, create referral **token accounts** for
      the tokens fees will be collected in — at minimum **SOL and USDC**
      (plus USDT to cover all fee-supported outputs in the app's list).
      A fee account is per-token-mint, and a swap whose output token has
      no referral token account on-chain cannot settle its fee. (Some of
      the 14 available token accounts were already created on
      2026-11-25; whichever of SOL/USDC/USDT are still missing need
      creating.) JUP, BONK and WIF have no referral token accounts by
      design — the app runs those swaps fee-free (see "How the fee model
      works").
- [x] **Wire the fee account into config.** Done — the referral account
      address above is the default in `src/config.ts` (override with
      `VITE_REFERRAL_ACCOUNT` in `.env` if it ever changes), and
      `buildSwapTransaction` selects the referral token account per
      output mint automatically.
- [ ] **Choose the final fee %.** Default is 0.50% (50 bps). For reference:
      Jupiter's own UI historically charged ~0.1% on some pairs, third-party
      terminals often take 0.5–1%. Higher fee = more revenue per swap but
      worse prices vs. competitors. This is a business decision, not a code
      decision.
- [ ] **Get a dedicated RPC** (Helius, Triton, QuickNode…). The public RPC
      in the starter is rate-limited and will not hold up under real users.
      Set `VITE_SOLANA_RPC`.
- [ ] **Domain + hosting.** Buy a domain, point it at any static host
      (Vercel / Netlify / Cloudflare Pages), deploy the `dist/` build.
- [ ] **Get legal advice before taking real users.** Operating a swap
      front-end that takes a fee can touch money-transmission rules,
      securities law (SEC), sanctions/OFAC screening, and tax reporting,
      depending on where users are. Talk to a crypto-savvy attorney first.
      Seriously — this step protects everything else you're building.
- [ ] **Terms of service + disclosures.** Publish terms that disclose the
      platform fee clearly (the UI already shows it on every quote — keep
      it that way).

## Roadmap (from the concept Space)

- **Module 1 (this repo):** swap terminal + platform fee via Jupiter.
- **Module 2 (this repo, Launch tab):** token launchpad with a flat creation fee.
- **Module 3:** perps front-end (Hyperliquid-style) with builder fees.

## Notes / stubs in this starter

- Token list is a fixed default set in `src/tokens.ts`; a searchable token
  picker pulling Jupiter's token list is a natural next step.
- The fee account is derived per output mint (the referral account's ATA
  for that mint) in `src/lib/jupiter.ts`; outputs without referral-fee
  support (JUP, BONK, WIF) swap fee-free by design.
- Slippage is fixed at 0.5% in the UI call; expose a slippage setting next.
