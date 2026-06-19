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
    onSuccess: (r: { digest: string }) => { setTx({ kind: 'ok', msg: `${label} terkirim — digest ${r.digest.slice(0, 14)}…` }); setTimeout(refetchAll, 1500); },
    onError: (e: Error) => setTx({ kind: 'err', msg: `${label} gagal: ${e.message}` }),
  });
  const deposit = () => {
    if (!acct || !firstDusdc) return; setTx(null);
    signExec({ transaction: buildDeposit(acct.address, firstDusdc.coinObjectId, BigInt(Math.floor(+amount * 1e6))) as any }, onResult('Deposit'));
  };
  const withdraw = () => {
    if (!acct || !firstShare) return; setTx(null);
    signExec({ transaction: buildWithdraw(acct.address, firstShare.coinObjectId) as any }, onResult('Withdraw'));
  };

  const tailImprove = simStats.plp.cvar1 - simStats.jaga.cvar1; // positif = membaik
  const yieldGiveup = simStats.plp.mean - simStats.jaga.mean;

  return (
    <>
      {/* ---------- NAV ---------- */}
      <nav className="nav">
        <div className="container nav-inner">
          <a className="brand" href="#top"><img src="/logo.png" alt="" />Jaga</a>
          <div className="nav-links">
            <a href="#how">Cara kerja</a>
            <a href="#sim">Simulasi</a>
            <a href="#app">Vault</a>
            <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          </div>
          <ConnectButton connectText="Connect Wallet" />
        </div>
      </nav>

      {/* ---------- HERO ---------- */}
      <header id="top" className="container hero">
        <span className="badge">🛡️ Sui Overflow 2026 · Track DeepBook Predict</span>
        <h1>Yield PLP, <span className="accent">tanpa risiko crash.</span></h1>
        <p className="sub">
          Vault otomatis di DeepBook Predict yang memanen yield PLP sambil membeli asuransi crash
          (opsi binary OTM). Satu token <b>jSHARE</b> yang composable, hedge di-roll otomatis tiap expiry.
        </p>
        <div className="hero-cta">
          <a className="btn btn-primary" href="#app">Buka Vault →</a>
          <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer">★ Lihat di GitHub</a>
        </div>
        <div className="chips">
          <span className="chip"><span className="dot" /> Live di Sui testnet</span>
          <span className="chip">NAV <b>{v ? v.nav.toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' dUSDC' : '—'}</b></span>
          <span className="chip">Hedge ratio <b>{v ? (v.hedgeRatioBps / 100).toFixed(2) + '%' : '—'}</b></span>
          <span className="chip">CVaR-1% membaik <b>+{(tailImprove * 100).toFixed(0)} poin</b></span>
        </div>
      </header>

      {/* ---------- PROBLEM ---------- */}
      <section className="section container" id="why">
        <div className="eyebrow">Masalahnya</div>
        <h2 className="title">Pemilik PLP itu “si rumah”.</h2>
        <p className="lead">
          Di DeepBook Predict, PLP mengambil sisi lawan tiap trade. Saat pasar tenang mereka panen premi —
          tapi saat BTC bergerak ekstrem, payout binary memukul PLP keras. Ekor-kiri yang gemuk inilah yang
          menahan LP serius masuk.
        </p>
        <div className="grid-3">
          <div className="card feature"><div className="ico">📈</div><h3>Tenang = cuan</h3><p>Premi mengalir ke PLP saat tidak ada yang bergerak tajam. Yield-nya menarik.</p></div>
          <div className="card feature"><div className="ico">💥</div><h3>Crash = derita</h3><p>Saat gap turun, trader binary menang besar dan PLP membayar — drawdown ekor brutal.</p></div>
          <div className="card feature"><div className="ico">🚪</div><h3>LP serius menjauh</h3><p>“Apakah PLP aman?” Tanpa proteksi ekor, modal besar enggan masuk.</p></div>
        </div>
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="section container" id="how">
        <div className="eyebrow">Solusinya</div>
        <h2 className="title">Dua kaki, satu token.</h2>
        <p className="lead">Jaga tetap memanen yield PLP, tapi memangkas drawdown crash dengan membeli asuransi murah di protokol yang sama.</p>
        <div className="grid-2">
          <div className="card leg yield">
            <span className="tag">● Kaki 1 — Yield</span>
            <h3>Supply PLP</h3>
            <p>Setor dUSDC ke pool PLP Predict lewat <code>predict::supply</code> — sepenuhnya trustless di dalam Vault.</p>
            <ul>
              <li>Untung saat: pasar tenang</li>
              <li>Biaya saat: crash (PLP bayar payout)</li>
              <li>Trustless, berbasis coin di dalam shared Vault</li>
            </ul>
          </div>
          <div className="card leg hedge">
            <span className="tag">● Kaki 2 — Hedge</span>
            <h3>Beli binary OTM-DOWN</h3>
            <p>Tiap roll, sebagian kecil NAV menebus PLP → mendanai mint <code>predict::mint</code> sebagai asuransi crash.</p>
            <ul>
              <li>Untung saat: BTC crash (justru saat PLP berdarah)</li>
              <li>Biaya saat: tenang (premi tipis hangus)</li>
              <li>Strike auto-melangkah ke level mintable terdalam</li>
            </ul>
          </div>
        </div>
        <div className="grid-3" style={{ marginTop: 18 }}>
          <div className="card feature"><div className="ico">🪙</div><h3>jSHARE composable</h3><p>Posisi hedged dibungkus jadi satu <code>Coin&lt;SHARE&gt;</code> — bisa dipakai sebagai kolateral/LP.</p></div>
          <div className="card feature"><div className="ico">🤖</div><h3>Keeper auto-roll</h3><p>Bot me-roll hedge tiap expiry & sinkron NAV. Restart-safe: posisi di-rediscover on-chain.</p></div>
          <div className="card feature"><div className="ico">🔐</div><h3>Capability-scoped</h3><p>Mint owner-gated didelegasikan ke operator hanya untuk budget hedge — tak pernah principal.</p></div>
        </div>
      </section>

      {/* ---------- SIMULATION ---------- */}
      <section className="section container" id="sim">
        <div className="eyebrow">Bukti</div>
        <h2 className="title">Backtest 30.000 jalur Monte-Carlo.</h2>
        <p className="lead">Distribusi imbal-hasil PLP mentah vs Jaga. Ekor kiri (crash) dipangkas tajam dengan melepas sedikit yield.</p>
        <div className="statrow" style={{ marginBottom: 18 }}>
          <div className="statbox"><div className="k">CVaR-1% · PLP mentah</div><div className="v red">{pct(simStats.plp.cvar1)}</div></div>
          <div className="statbox"><div className="k">CVaR-1% · Jaga</div><div className="v blue">{pct(simStats.jaga.cvar1)}</div></div>
          <div className="statbox"><div className="k">Perbaikan ekor</div><div className="v green">+{(tailImprove * 100).toFixed(0)} poin</div></div>
          <div className="statbox"><div className="k">Yield dilepas</div><div className="v">{pct(yieldGiveup)}</div></div>
        </div>
        <div className="card">
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <AreaChart data={simDist as any} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gPlp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e5484d" stopOpacity={0.35} /><stop offset="100%" stopColor="#e5484d" stopOpacity={0.02} /></linearGradient>
                  <linearGradient id="gJaga" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f6bf7" stopOpacity={0.35} /><stop offset="100%" stopColor="#2f6bf7" stopOpacity={0.02} /></linearGradient>
                </defs>
                <XAxis dataKey="ret" tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={(x) => (x * 100).toFixed(0) + '%'} axisLine={{ stroke: '#e3e8f0' }} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e3e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(16,32,64,.1)' }} labelFormatter={(x) => 'return ' + (Number(x) * 100).toFixed(1) + '%'} />
                <Legend />
                <ReferenceLine x={simStats.plp.cvar1} stroke="#e5484d" strokeDasharray="4 4" label={{ value: 'CVaR PLP', fill: '#e5484d', fontSize: 11, position: 'insideTopLeft' }} />
                <ReferenceLine x={simStats.jaga.cvar1} stroke="#2f6bf7" strokeDasharray="4 4" label={{ value: 'CVaR Jaga', fill: '#2f6bf7', fontSize: 11, position: 'insideTopRight' }} />
                <Area type="monotone" dataKey="PLP" name="PLP mentah" stroke="#e5484d" fill="url(#gPlp)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="Jaga" name="Jaga (hedged)" stroke="#2f6bf7" fill="url(#gJaga)" strokeWidth={2.2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="hint" style={{ marginTop: 8 }}>Garis putus = CVaR-1% (rata-rata 1% kasus terburuk). Jaga menggeser ekor kiri ke kanan secara signifikan.</p>
        </div>
      </section>

      {/* ---------- APP / DASHBOARD ---------- */}
      <section className="section container" id="app">
        <div className="eyebrow">Live di testnet</div>
        <h2 className="title">Vault.</h2>
        <p className="lead">Hubungkan wallet Sui (testnet), setor dUSDC, terima jSHARE. Keeper menangani hedge-nya.</p>

        {!deployed && <div className="banner warn">⚠️ Vault belum di-deploy. Set <code>NEXT_PUBLIC_JAGA_*</code> di <code>.env.local</code>.</div>}

        <div className="card">
          <div className="panel-head">
            <div style={{ fontWeight: 700, fontSize: 17 }}>State Vault</div>
            <ConnectButton connectText="Connect Wallet" />
          </div>
          <div className="statrow">
            <div className="statbox"><div className="k">NAV (dUSDC)</div><div className="v">{v ? v.nav.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</div></div>
            <div className="statbox"><div className="k">Harga / jSHARE</div><div className="v">{v ? v.navPerShare.toFixed(4) : '—'}</div></div>
            <div className="statbox"><div className="k">Harga PLP</div><div className="v">{v ? v.plpPx.toFixed(4) : '—'}</div></div>
            <div className="statbox"><div className="k">Status</div><div className="v" style={{ color: v && !v.paused ? 'var(--green)' : undefined }}>{v ? (v.paused ? 'Paused' : 'Active') : '—'}</div></div>
          </div>

          {tx && <div className={`banner ${tx.kind}`}>{tx.kind === 'ok' ? '✅ ' : '⚠️ '}{tx.msg}</div>}

          <div className="divider" />

          <div className="grid-2">
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Deposit</div>
              <div className="field">
                <input className="amt" placeholder="jumlah dUSDC" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <button className="btn btn-primary" disabled={!acct || isPending || !deployed || !firstDusdc} onClick={deposit}>Deposit dUSDC</button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>{acct ? (firstDusdc ? `Saldo dUSDC: ${(Number(firstDusdc.balance) / 1e6).toFixed(2)}` : 'Tidak ada dUSDC — minta di tally.so/r/Xx102L') : 'Hubungkan wallet dulu.'}</p>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Withdraw</div>
              <div className="field">
                <button className="btn btn-ghost" disabled={!acct || isPending || !deployed || !firstShare} onClick={withdraw}>Withdraw semua jSHARE</button>
              </div>
              <p className="hint" style={{ marginTop: 8 }}>{firstShare ? `Saldo jSHARE: ${(Number(firstShare.balance) / 1e6).toFixed(2)}` : 'Belum ada jSHARE.'}</p>
            </div>
          </div>
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
            <a href="#how">Cara kerja</a>
          </div>
        </div>
      </footer>
    </>
  );
}
