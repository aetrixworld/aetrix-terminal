/**
 * Module 2 — token launchpad transaction builder.
 *
 * Builds ONE legacy transaction that, atomically:
 *   1. creates a brand-new Token-2022 mint with on-chain metadata
 *      (MetadataPointer + TokenMetadata extensions, metadata stored on the
 *      mint account itself),
 *   2. mints the full supply to the creator's associated token account,
 *   3. optionally revokes the mint authority (fixed supply forever), and
 *   4. pays the platform's flat creation fee (LAUNCH_FEE_SOL) to
 *      PLATFORM_WALLET.
 *
 * If any step fails, none of it settles — the creator never pays the fee
 * for a token that didn't launch. The creator signs with their wallet;
 * the fresh mint keypair is returned so the caller can pass it to
 * wallet-adapter's sendTransaction as an additional signer.
 */
import {
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  type Connection,
  type PublicKey,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  AuthorityType,
  ExtensionType,
  LENGTH_SIZE,
  TOKEN_2022_PROGRAM_ID,
  TYPE_SIZE,
  createAssociatedTokenAccountInstruction,
  createInitializeMetadataPointerInstruction,
  createInitializeMintInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAssociatedTokenAddressSync,
  getMintLen,
} from '@solana/spl-token';
import {
  createInitializeInstruction as createInitializeTokenMetadataInstruction,
  pack,
  type TokenMetadata,
} from '@solana/spl-token-metadata';
import { LAUNCH_FEE_SOL, PLATFORM_WALLET } from '../config';

export interface LaunchParams {
  /** Token name, stored in the on-chain metadata (max 32 chars, enforced by the UI). */
  name: string;
  /** Token symbol, stored in the on-chain metadata (max 10 chars, enforced by the UI). */
  symbol: string;
  /** Metadata URI — typically the token image URL; may be an empty string. */
  uri: string;
  /** Optional description, stored as a `description` entry in additionalMetadata. */
  description?: string;
  /** Mint decimals (0, 6, or 9 in the UI). */
  decimals: number;
  /**
   * Total supply in whole tokens, as an integer string (e.g. "1000000000").
   * A string so large supplies survive exactly — supply * 10^decimals
   * routinely exceeds Number.MAX_SAFE_INTEGER and is computed with BigInt.
   */
  supply: string;
  /** When true, the mint authority is revoked in the same transaction: fixed supply forever. */
  revokeMintAuthority: boolean;
}

export interface LaunchBuild {
  /** Ready to send: feePayer and recent blockhash are set. */
  transaction: Transaction;
  /** The new token's mint address. */
  mint: PublicKey;
  /** Signer for the mint account — pass to sendTransaction via { signers: [mintKeypair] }. */
  mintKeypair: Keypair;
  /** Blockhash baked into the transaction, for confirmTransaction. */
  blockhash: string;
  lastValidBlockHeight: number;
}

export async function buildLaunchTransaction(
  connection: Connection,
  creator: PublicKey,
  params: LaunchParams,
): Promise<LaunchBuild> {
  const mintKeypair = Keypair.generate();
  const mint = mintKeypair.publicKey;

  const metadata: TokenMetadata = {
    updateAuthority: creator,
    mint,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    additionalMetadata: params.description
      ? [['description', params.description]]
      : [],
  };

  // Mint account space: base mint + extension TLVs (from getMintLen), plus
  // the variable-length token-metadata entry itself (type + length + packed
  // metadata). The account is funded rent-exempt for the full size.
  const mintLen = getMintLen([
    ExtensionType.MetadataPointer,
    ExtensionType.TokenMetadata,
  ]);
  const metadataLen = TYPE_SIZE + LENGTH_SIZE + pack(metadata).length;
  const space = mintLen + metadataLen;
  const lamports = await connection.getMinimumBalanceForRentExemption(space);

  const creatorAta = getAssociatedTokenAddressSync(
    mint,
    creator,
    false,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const supplyBaseUnits = BigInt(params.supply) * 10n ** BigInt(params.decimals);
  const feeLamports = Math.round(LAUNCH_FEE_SOL * LAMPORTS_PER_SOL);

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash('confirmed');

  const transaction = new Transaction();
  transaction.feePayer = creator;
  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;

  transaction.add(
    // 1. Create + fund the mint account (owned by Token-2022, signed by the mint keypair).
    SystemProgram.createAccount({
      fromPubkey: creator,
      newAccountPubkey: mint,
      space,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    // 2. MetadataPointer extension: the metadata lives on the mint itself.
    createInitializeMetadataPointerInstruction(
      mint,
      creator,
      mint,
      TOKEN_2022_PROGRAM_ID,
    ),
    // 3. TokenMetadata extension: name / symbol / uri (+ description above).
    //    Must be initialized before the mint itself.
    createInitializeTokenMetadataInstruction({
      programId: TOKEN_2022_PROGRAM_ID,
      metadata: mint,
      updateAuthority: creator,
      mint,
      mintAuthority: creator,
      name: params.name,
      symbol: params.symbol,
      uri: params.uri,
    }),
    // 4. Initialize the mint: creator is mint authority, no freeze authority.
    createInitializeMintInstruction(
      mint,
      params.decimals,
      creator,
      null,
      TOKEN_2022_PROGRAM_ID,
    ),
    // 5. Creator's associated token account for the new mint.
    createAssociatedTokenAccountInstruction(
      creator,
      creatorAta,
      creator,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    // 6. Mint the full supply to the creator.
    createMintToInstruction(
      mint,
      creatorAta,
      creator,
      supplyBaseUnits,
      [],
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  // 7. Optional: revoke the mint authority so no more supply can ever be minted.
  if (params.revokeMintAuthority) {
    transaction.add(
      createSetAuthorityInstruction(
        mint,
        creator,
        AuthorityType.MintTokens,
        null,
        [],
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  // 8. Platform creation fee — same transaction, or the launch doesn't happen.
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: creator,
      toPubkey: PLATFORM_WALLET,
      lamports: feeLamports,
    }),
  );

  return { transaction, mint, mintKeypair, blockhash, lastValidBlockHeight };
}
