'use client';
import { useState } from 'react';
import { ConnectButton, useCurrentAccount, useSuiClientQuery, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { CFG, buildDeposit, buildWithdraw, parseVault } from './lib/jaga';
import { simDist, simStats } from './lib/simData';

const deployed = CFG.vault !== '0x0';
const SHARE_TYPE = `${CFG.pkg}::share::SHARE`;
const pctNum = (x: number) => (x * 100).toFixed(1) + '%';

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
    onSuccess: (r: { digest: string }) => { setTx({ kind: 'ok', msg: `${label} terkirim: ${r.digest.slice(0, 12)}…` }); setTimeout(refetchAll, 1500); },
    onError: (e: Error) => setTx({ kind: 'err', msg: `${label} gagal: ${e.message}` }),
  });

  const deposit = () => {
    if (!acct || !firstDusdc) return;
    setTx(null);
    signExec({ transaction: buildDeposit(acct.address, firstDusdc.coinObjectId, BigInt(Math.floor(+amount * 1e6))) as any }, onResult('Deposit'));
  };
  const withdraw = () => {
    if (!acct || !firstShare) return;
    setTx(null);
    signExec({ transaction: buildWithdraw(acct.address, firstShare.coinObjectId) as any }, onResult('Withdraw'));
  };

  return (
    <main className="wrap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>🛡️ Jaga</h1><ConnectButton />
      </div>
      <p className="muted">Hasil yield PLP, dikurangi asuransi crash — di DeepBook Predict.</p>
      {!deployed && <div className="card" style={{ borderColor: '#9e6a03' }}>⚠️ Vault belum di-deploy. Set <code>NEXT_PUBLIC_JAGA_*</code> di <code>.env.local</code> setelah publish testnet.</div>}

      <div className="card row">
        <div className="stat"><div className="k">NAV (dUSDC)</div><div className="v">{v ? v.nav.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}</div></div>
        <div className="stat"><div className="k">Harga / jSHARE</div><div className="v">{v ? v.navPerShare.toFixed(4) : '—'}</div></div>
        <div className="stat"><div className="k">Harga PLP</div><div className="v">{v ? v.plpPx.toFixed(4) : '—'}</div></div>
        <div className="stat"><div className="k">Hedge ratio</div><div className="v">{v ? (v.hedgeRatioBps / 100).toFixed(2) + '%' : '—'}</div></div>
        <div className="stat"><div className="k">Status</div><div className="v">{v ? (v.paused ? 'Paused' : 'Active') : '—'}</div></div>
      </div>
      {tx && (
        <div className="card" style={{ borderColor: tx.kind === 'ok' ? '#238636' : '#da3633' }}>
          {tx.kind === 'ok' ? '✅ ' : '⚠️ '}{tx.msg}
        </div>
      )}

      <div className="card">
        <h2>Distribusi PnL (backtest 30k path) — PLP mentah vs Jaga</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="stat"><div className="k">CVaR 1% — PLP</div><div className="v" style={{ color: '#f85149' }}>{pctNum(simStats.plp.cvar1)}</div></div>
          <div className="stat"><div className="k">CVaR 1% — Jaga</div><div className="v" style={{ color: '#2f81f7' }}>{pctNum(simStats.jaga.cvar1)}</div></div>
          <div className="stat"><div className="k">Yield dilepas</div><div className="v">{pctNum(simStats.plp.mean - simStats.jaga.mean)}</div></div>
        </div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <LineChart data={simDist as any}>
              <XAxis dataKey="ret" tick={{ fill: '#8b98a5', fontSize: 11 }} tickFormatter={(x) => (x * 100).toFixed(0) + '%'} />
              <YAxis tick={{ fill: '#8b98a5', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#121821', border: '1px solid #1e2733' }} labelFormatter={(x) => 'return ' + (Number(x) * 100).toFixed(1) + '%'} />
              <Legend />
              <ReferenceLine x={simStats.plp.cvar1} stroke="#f85149" strokeDasharray="3 3" />
              <ReferenceLine x={simStats.jaga.cvar1} stroke="#2f81f7" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="PLP" name="PLP mentah" stroke="#f85149" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="Jaga" name="Jaga (25% hedge)" stroke="#2f81f7" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="muted">Ekor kiri (crash) PLP mentah jauh lebih gemuk; Jaga memangkasnya — CVaR 1% membaik ~16 poin dengan melepas ~1% mean yield.</p>
      </div>

      <div className="card">
        <h2>Deposit</h2>
        <div className="row" style={{ alignItems: 'center' }}>
          <input placeholder="jumlah dUSDC" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="act" disabled={!acct || isPending || !deployed || !firstDusdc} onClick={deposit}>Deposit</button>
          <span className="muted">{acct ? (firstDusdc ? `coin dUSDC ditemukan (${(Number(firstDusdc.balance) / 1e6).toFixed(2)})` : 'tidak ada coin dUSDC — minta di tally.so/r/Xx102L') : 'connect wallet'}</span>
        </div>
        <h2 style={{ marginTop: 20 }}>Withdraw</h2>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="act" disabled={!acct || isPending || !deployed || !firstShare} onClick={withdraw}>Withdraw semua jSHARE</button>
          <span className="muted">{firstShare ? `jSHARE: ${(Number(firstShare.balance) / 1e6).toFixed(2)}` : 'belum punya jSHARE'}</span>
        </div>
      </div>
    </main>
  );
}
