/**
 * Backtest Monte-Carlo: "PLP mentah" vs "Jaga (PLP + hedge)" — model lompatan (jump).
 * Bukti kredibilitas vault (WAJIB track DeepBook Predict).
 *
 * Model ekonomi (disederhanakan; kalibrasi nyata dari OracleSVI nanti):
 *  - Tiap siklus PLP menerima spread `theta` (edge rumah).
 *  - Dengan prob `pCrash` terjadi crash → PLP rugi `sev` (severitas acak).
 *  - Net: mean PLP POSITIF di kondisi normal, tapi EKOR KIRI gemuk (rentetan crash).
 *  - Hedge = beli binary OTM "deep crash": bayar premi tiap siklus, payout besar saat
 *    crash dalam (sev > hedgeTrigger) → mean turun sedikit, ekor (CVaR) membaik banyak.
 *
 * Output: console table + out/sweep.csv + out/summary.json + web/app/lib/simData.ts (grafik).
 */
import { writeFileSync, mkdirSync } from 'node:fs';

type Params = {
  paths: number; cycles: number; theta: number;
  pCrash: number; sevMin: number; sevMax: number;
  hedgeTrigger: number; payoutMult: number;
};
type Ev = { crash: boolean; sev: number };

function genEvents(p: Params): Ev[][] {
  const rows: Ev[][] = [];
  for (let i = 0; i < p.paths; i++) {
    const row: Ev[] = new Array(p.cycles);
    for (let c = 0; c < p.cycles; c++) {
      const crash = Math.random() < p.pCrash;
      row[c] = { crash, sev: crash ? p.sevMin + Math.random() * (p.sevMax - p.sevMin) : 0 };
    }
    rows.push(row);
  }
  return rows;
}
function plpPnl(row: Ev[], p: Params): number {
  let pnl = 0; for (const e of row) pnl += p.theta - e.sev; return pnl;
}
function jagaPnl(row: Ev[], p: Params, bps: number): number {
  const budget = p.theta * (bps / 10_000); let pnl = 0;
  for (const e of row) {
    pnl += p.theta - e.sev - budget;
    if (e.crash && e.sev > p.hedgeTrigger) pnl += budget * p.payoutMult;
  }
  return pnl;
}
function stats(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const q = (pp: number) => s[Math.floor(pp * (s.length - 1))];
  const cvar = (pp: number) => { const n = Math.max(1, Math.floor(pp * s.length)); let t = 0; for (let i = 0; i < n; i++) t += s[i]; return t / n; };
  return { mean, p50: q(0.5), VaR5: q(0.05), CVaR1: cvar(0.01), min: s[0] };
}
function hist(xs: number[], lo: number, hi: number, bins: number) {
  const w = (hi - lo) / bins, counts = new Array(bins).fill(0);
  for (const x of xs) { let b = Math.floor((x - lo) / w); if (b < 0) b = 0; if (b >= bins) b = bins - 1; counts[b]++; }
  return counts.map((c, i) => ({ ret: +(lo + (i + 0.5) * w).toFixed(3), d: +(c / xs.length / w).toFixed(4) }));
}
const pct = (x: number) => (x * 100).toFixed(2) + '%';

const P: Params = {
  paths: 30_000, cycles: 96, theta: 0.004,
  pCrash: 0.03, sevMin: 0.03, sevMax: 0.18, hedgeTrigger: 0.07, payoutMult: 40,
};

console.log('Jaga backtest (jump model) — params:', P, '\n');
const E = genEvents(P);
const plp = E.map((r) => plpPnl(r, P));
const plpS = stats(plp);

const ratios = [0, 1000, 2000, 2500, 3000, 4000, 5000];
const rows = ratios.map((bps) => {
  const js = stats(E.map((r) => jagaPnl(r, P, bps)));
  return { hedge_bps: bps, mean: js.mean, yield_giveup: plpS.mean - js.mean, CVaR1: js.CVaR1, tail_improve: js.CVaR1 - plpS.CVaR1, min: js.min };
});

console.log('PLP mentah :', { mean: pct(plpS.mean), p50: pct(plpS.p50), VaR5: pct(plpS.VaR5), CVaR1: pct(plpS.CVaR1), min: pct(plpS.min) });
console.log('\nSweep hedge_ratio (Jaga):');
console.table(rows.map((r) => ({ hedge_bps: r.hedge_bps, 'mean yield': pct(r.mean), 'yield dilepas': pct(r.yield_giveup), 'CVaR1 (ekor)': pct(r.CVaR1), 'ekor membaik': pct(r.tail_improve), worst: pct(r.min) })));

// === Output untuk grafik dashboard (distribusi PnL PLP vs Jaga@2500bps) ===
const jaga2500 = E.map((r) => jagaPnl(r, P, 2500));
const j2500S = stats(jaga2500);
const lo = -1.2, hi = 0.4, bins = 64;
const hp = hist(plp, lo, hi, bins), hj = hist(jaga2500, lo, hi, bins);
const dist = hp.map((b, i) => ({ ret: b.ret, PLP: b.d, Jaga: hj[i].d }));

mkdirSync('out', { recursive: true });
writeFileSync('out/sweep.csv', ['hedge_bps,mean,yield_giveup,CVaR1,tail_improve,min', ...rows.map((r) => [r.hedge_bps, r.mean, r.yield_giveup, r.CVaR1, r.tail_improve, r.min].join(','))].join('\n'));
writeFileSync('out/summary.json', JSON.stringify({ params: P, plp: plpS, jaga2500: j2500S, sweep: rows }, null, 2));

mkdirSync('../web/app/lib', { recursive: true });
writeFileSync('../web/app/lib/simData.ts',
  `// AUTO-GENERATED oleh sim/src/backtest.ts — jangan edit manual.\n` +
  `export const simDist = ${JSON.stringify(dist)} as const;\n` +
  `export const simStats = ${JSON.stringify({ plp: { mean: plpS.mean, cvar1: plpS.CVaR1 }, jaga: { ratioBps: 2500, mean: j2500S.mean, cvar1: j2500S.CVaR1 } })} as const;\n`);

console.log('\n→ out/sweep.csv, out/summary.json, web/app/lib/simData.ts ditulis.');
console.log('Baca: di hedge_bps moderat, "ekor membaik" besar sementara "yield dilepas" kecil → tesis vault valid.');
