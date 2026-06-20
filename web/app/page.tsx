'use client';
import { useState } from 'react';
import { ConnectButton, useCurrentAccount, useSuiClientQuery, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { CFG, buildDeposit, buildWithdraw, parseVault } from './lib/jaga';
import { simDist, simStats } from './lib/simData';

const deployed = CFG.vault !== '0x0';
const SHARE_TYPE = `${CFG.pkg}::share::SHARE`;
const pct = (x: number) => (x * 100).toFixed(1) + '%';
const REPO = 'https://github.com/PugarHuda/jaga';
const TEAL = '#0ea5a4';

export default function Page() {
  const acct = useCurrentAccount();
  const [amount, setAmount] = useState('100');
  const [tx, setTx] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const { mutate: signExec, isPending } = useSignAndExecuteTransaction();

  const vaultQ = useSuiClientQuery('getObject', { id: CFG.vault, options: { showContent: true } }, { enabled: deployed });
  const v = (vaultQ.data?.data?.content as any)?.fields ? parseVault((vaultQ.data!.data!.content as any).fields) : null;

  const owner = acct?.address ?? '';
  const dusdcQ = useSuiClientQuery('getCoins', { owner, coinType: CFG.dusdcType }, { enabled: !!acct });
  const shareQ = useSuiClientQuery('getCoins', { owner, coinType: SHARE_TYPE }, { enabled: !!acct && deployed });
  const firstDusdc = dusdcQ.data?.data?.[0];
  const firstShare = shareQ.data?.data?.[0];

  const refetchAll = () => { vaultQ.refetch(); dusdcQ.refetch(); shareQ.refetch(); };
  const onResult = (label: string) => ({
    onSuccess: (r: { digest: string }) => { setTx({ kind: 'ok', msg: `${label} sent — digest ${r.digest.slice(0, 14)}…` }); setTimeout(refetchAll, 1500); },
    onError: (e: Error) => setTx({ kind: 'err', msg: `${label} failed: ${e.message}` }),
  });
  const deposit = () => {
    if (!acct || !firstDusdc) return; setTx(null);
    signExec({ transaction: buildDeposit(acct.address, firstDusdc.coinObjectId, BigInt(Math.floor(+amount * 1e6))) as any }, onResult('Deposit'));
  };
  const withdraw = () => {
    if (!acct || !firstShare) return; setTx(null);
    signExec({ transaction: buildWithdraw(acct.address, firstShare.coinObjectId) as any }, onResult('Withdraw'));
  };

  const tailImprove = simStats.plp.cvar1 - simStats.jaga.cvar1; // positive = better
  const yieldGiveup = simStats.plp.mean - simStats.jaga.mean;

  return (
    <>
      {/* ---------- NAV ---------- */}
      <nav className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top"><img src="/logo.png" alt="" />Jaga</a>
          <div className="nav-links">
            <a href="#how">How it works</a>
            <a href="#sim">Simulation</a>
            <a href="#app">Vault</a>
            <a href="#roadmap">Roadmap</a>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <ConnectButton connectText="Connect Wallet" />
        </div>
      </nav>

      {/* ---------- HERO ---------- */}
      <header id="top" className="container hero">
        <span className="badge">🛡️ Sui Overflow 2026 · DeepBook Predict track</span>
        <h1>PLP yield, <span className="accent">minus the crash.</span></h1>
        <p className="sub">
          An automated vault on DeepBook Predict that earns PLP yield while buying crash insurance
          (OTM binary puts). One composable <b>jSHARE</b> token; the hedge auto-rolls every expiry.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#app">Open the Vault →</a>
          <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer">★ View on GitHub</a>
        </div>
        <div className="chips">
          <span className="chip"><span className="dot" /> Live on Sui testnet</span>
          <span className="chip">NAV <b>{v ? v.nav.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' dUSDC' : '—'}</b></span>
          <span className="chip">Hedge ratio <b>{v ? (v.hedgeRatioBps / 100).toFixed(2) + '%' : '—'}</b></span>
          <span className="chip">CVaR-1% better by <b>+{(tailImprove * 100).toFixed(0)} pts</b></span>
        </div>
      </header>

      {/* ---------- PROBLEM ---------- */}
      <section className="section container" id="why">
        <div className="eyebrow">The problem</div>
        <h2 className="title">PLP holders are “the house”.</h2>
        <p className="lead">
          On DeepBook Predict, PLP takes the other side of every trade. When markets are calm they
          collect premium — but when BTC gaps, binary payouts hit PLP hard. That fat left tail is what
          keeps serious LPs out.
        </p>
        <div className="grid-3">
          <div className="card feature"><div className="ico">📈</div><h3>Calm = profit</h3><p>Premium flows to PLP when nothing moves sharply. The yield is genuinely attractive.</p></div>
          <div className="card feature"><div className="ico">💥</div><h3>Crash = pain</h3><p>On a gap down, binary traders win big and PLP pays out — a brutal left-tail drawdown.</p></div>
          <div className="card feature"><div className="ico">🚪</div><h3>Serious LPs stay out</h3><p>“Is PLP safe?” Without tail protection, large capital won’t come in.</p></div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="section container" id="how">
        <div className="eyebrow">The solution</div>
        <h2 className="title">Two legs, one token.</h2>
        <p className="lead">Jaga keeps the PLP yield but caps crash drawdown by buying cheap insurance on the very same protocol.</p>
        <div className="grid-2">
          <div className="card leg yield">
            <span className="tag">● Leg 1 — Yield</span>
            <h3>Supply PLP</h3>
            <p>Supply dUSDC to Predict’s PLP pool via <code>predict::supply</code> — fully trustless inside the Vault.</p>
            <ul>
              <li>Profits when: markets are calm</li>
              <li>Costs when: crash (PLP pays the payout)</li>
              <li>Trustless, coin-based, inside the shared Vault</li>
            </ul>
          </div>
          <div className="card leg hedge">
            <span className="tag">● Leg 2 — Hedge</span>
            <h3>Buy OTM-DOWN binaries</h3>
            <p>Each roll, a small slice of NAV redeems PLP → funds a <code>predict::mint</code> as crash insurance.</p>
            <ul>
              <li>Profits when: BTC crashes (exactly when PLP bleeds)</li>
              <li>Costs when: calm (a thin premium expires)</li>
              <li>Strike auto-steps to the deepest mintable level</li>
            </ul>
          </div>
        </div>
        <div className="grid-3" style={{ marginTop: 18 }}>
          <div className="card feature"><div className="ico">🪙</div><h3>Composable jSHARE</h3><p>The hedged position is wrapped into one <code>Coin&lt;SHARE&gt;</code> — usable as collateral / LP.</p></div>
          <div className="card feature"><div className="ico">🤖</div><h3>Keeper auto-roll</h3><p>A bot rolls the hedge each expiry and syncs NAV. Restart-safe: positions are rediscovered on-chain.</p></div>
          <div className="card feature"><div className="ico">🔐</div><h3>Capability-scoped</h3><p>The owner-gated mint is delegated to an operator for the hedge budget only — never the principal.</p></div>
        </div>
      </section>

      {/* ---------- SIMULATION ---------- */}
      <section className="section container" id="sim">
        <div className="eyebrow">The proof</div>
        <h2 className="title">30,000-path Monte-Carlo backtest.</h2>
        <p className="lead">Return distribution of raw PLP vs Jaga. The left (crash) tail is sharply cut for a small amount of yield given up.</p>
        <div className="statrow" style={{ marginBottom: 18 }}>
          <div className="statbox"><div className="k">CVaR-1% · raw PLP</div><div className="v red">{pct(simStats.plp.cvar1)}</div></div>
          <div className="statbox"><div className="k">CVaR-1% · Jaga</div><div className="v blue">{pct(simStats.jaga.cvar1)}</div></div>
          <div className="statbox"><div className="k">Tail improvement</div><div className="v green">+{(tailImprove * 100).toFixed(0)} pts</div></div>
          <div className="statbox"><div className="k">Yield given up</div><div className="v">{pct(yieldGiveup)}</div></div>
        </div>
        <div className="card">
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <AreaChart data={simDist as any} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPlp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e5484d" stopOpacity={0.35} /><stop offset="100%" stopColor="#e5484d" stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="gJaga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEAL} stopOpacity={0.38} /><stop offset="100%" stopColor={TEAL} stopOpacity={0.02} /></linearGradient>
                </defs>
                <XAxis dataKey="ret" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(x) => (x * 100).toFixed(0) + '%'} axisLine={{ stroke: '#e3e8f0' }} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e3e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(16,32,64,.1)' }} labelFormatter={(x) => 'return ' + (Number(x) * 100).toFixed(1) + '%'} />
                <Legend />
                <ReferenceLine x={simStats.plp.cvar1} stroke="#e5484d" strokeDasharray="4 4" label={{ value: 'CVaR PLP', fill: '#e5484d', fontSize: 11, position: 'insideTopLeft' }} />
                <ReferenceLine x={simStats.jaga.cvar1} stroke={TEAL} strokeDasharray="4 4" label={{ value: 'CVaR Jaga', fill: TEAL, fontSize: 11, position: 'insideTopRight' }} />
                <Area type="monotone" dataKey="PLP" name="Raw PLP" stroke="#e5484d" fill="url(#gPlp)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Jaga" name="Jaga (hedged)" stroke={TEAL} fill="url(#gJaga)" strokeWidth={2.2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Dashed lines = CVaR-1% (mean of the worst 1% of cases). Jaga shifts the left tail decisively to the right.</p>
        </div>
      </section>

      {/* ---------- APP / DASHBOARD ---------- */}
      <section className="section container" id="app">
        <div className="eyebrow">Live on testnet</div>
        <h2 className="title">The Vault.</h2>
        <p className="lead">Connect a Sui wallet (testnet), deposit dUSDC, receive jSHARE. The keeper handles the hedge.</p>

        {!deployed && <div className="banner warn">⚠️ Vault not deployed. Set <code>NEXT_PUBLIC_JAGA_*</code> in <code>.env.local</code>.</div>}

        <div className="card">
          <div className="panel-head">
            <div style={{ fontWeight: 700, fontSize: 17 }}>Vault state</div>
            <ConnectButton connectText="Connect Wallet" />
          </div>
          <div className="statrow">
            <div className="statbox"><div className="k">NAV (dUSDC)</div><div className="v">{v ? v.nav.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</div></div>
            <div className="statbox"><div className="k">Price / jSHARE</div><div className="v">{v ? v.navPerShare.toFixed(4) : '—'}</div></div>
            <div className="statbox"><div className="k">PLP price</div><div className="v">{v ? v.plpPx.toFixed(4) : '—'}</div></div>
            <div className="statbox"><div className="k">Status</div><div className="v" style={{ color: v && !v.paused ? 'var(--green)' : undefined }}>{v ? (v.paused ? 'Paused' : 'Active') : '—'}</div></div>
          </div>

          {tx && <div className={`banner ${tx.kind}`}>{tx.kind === 'ok' ? '✅ ' : '⚠️ '}{tx.msg}</div>}

          <div className="divider" />

          <div className="grid-2">
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Deposit</div>
              <div className="field">
                <input className="amt" placeholder="dUSDC amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn btn-primary" disabled={!acct || isPending || !deployed || !firstDusdc} onClick={deposit}>Deposit dUSDC</button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>{acct ? (firstDusdc ? `dUSDC balance: ${(Number(firstDusdc.balance) / 1e6).toFixed(2)}` : 'No dUSDC — request at tally.so/r/Xx102L') : 'Connect a wallet first.'}</p>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Withdraw</div>
              <div className="field">
                <button className="btn btn-ghost" disabled={!acct || isPending || !deployed || !firstShare} onClick={withdraw}>Withdraw all jSHARE</button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>{firstShare ? `jSHARE balance: ${(Number(firstShare.balance) / 1e6).toFixed(2)}` : 'No jSHARE yet.'}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- ROADMAP ---------- */}
      <section className="section container" id="roadmap">
        <div className="eyebrow">What’s next</div>
        <h2 className="title">Roadmap.</h2>
        <p className="lead">Mainnet-ready architecture today; here’s where Jaga goes from here.</p>
        <div className="grid-2">
          <div className="card feature"><div className="ico">✅</div><h3>Now — Live on testnet</h3><p>Full deposit → PLP → hedge → settle loop running against the real Predict contracts, with a 30k-path backtest and a keeper.</p></div>
          <div className="card feature"><div className="ico">🎚️</div><h3>Next — Dynamic hedge ratio</h3><p>Size the hedge from realized vol and the live SVI surface instead of a static bps, tightening the cost/protection trade-off.</p></div>
          <div className="card feature"><div className="ico">🌐</div><h3>Then — Multi-asset</h3><p>Extend beyond BTC to every oracle Predict lists, with per-market hedge policies.</p></div>
          <div className="card feature"><div className="ico">🧩</div><h3>Later — jSHARE as collateral</h3><p>Make the hedged share token a first-class building block across Sui DeFi — lending, LP, structured products.</p></div>
        </div>
      </section>

      {/* ---------- FOOTER ---------- */}
      <footer className="footer">
        <div className="container">
          <div>
            <div className="brand" style={{ marginBottom: 6 }}><img src="/logo.png" alt="" style={{ width: 24, height: 24, borderRadius: 6 }} />Jaga</div>
            <div>PLP yield minus crash insurance · Sui Overflow 2026</div>
            <div className="mono" style={{ marginTop: 6 }}>pkg {CFG.pkg.slice(0, 10)}… · vault {CFG.vault.slice(0, 10)}…</div>
          </div>
          <div style={{ display: 'flex', gap: 22 }}>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
            <a href={`${REPO}/blob/main/docs/PROOF.md`} target="_blank" rel="noreferrer">Testnet proof</a>
            <a href="#how">How it works</a>
          </div>
        </div>
      </footer>
    </>
  );
}
