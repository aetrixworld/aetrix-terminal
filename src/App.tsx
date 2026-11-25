import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import SwapCard from './components/SwapCard';
import LaunchCard from './components/LaunchCard';
import { LAUNCH_FEE_SOL, PLATFORM_FEE_BPS } from './config';
import './App.css';

type Tab = 'swap' | 'launch';

export default function App() {
  const [tab, setTab] = useState<Tab>('swap');

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">◆</span>
          <div>
            <h1>Fee Terminal</h1>
            <p className="tagline">
              Non-custodial Solana swaps · {PLATFORM_FEE_BPS / 100}% platform fee
            </p>
          </div>
        </div>
        <WalletMultiButton />
      </header>

      <main>
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'swap'}
            className={tab === 'swap' ? 'active' : ''}
            onClick={() => setTab('swap')}
          >
            Swap
          </button>
          <button
            role="tab"
            aria-selected={tab === 'launch'}
            className={tab === 'launch' ? 'active' : ''}
            onClick={() => setTab('launch')}
          >
            Launch
          </button>
        </div>

        {tab === 'swap' ? <SwapCard /> : <LaunchCard />}

        <p className="foot">
          Routes by Jupiter aggregator. You always sign with your own wallet —
          the terminal never takes custody of funds. The platform fee is taken
          from the swap output, on-chain, inside the same transaction.
          Launching a token from the Launch tab costs a flat {LAUNCH_FEE_SOL}{' '}
          SOL creation fee, paid to the platform inside the launch
          transaction.
        </p>
      </main>
    </div>
  );
}
