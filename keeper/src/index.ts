/**
 * Keeper loop Jaga: pantau oracle Predict; saat settle → settle_hedge + sync_nav + open_hedge
 * untuk expiry berikutnya. DRY_RUN=true hanya simulasi (dry-run tx), tidak submit.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { sui, fetchOracles, sizeHedgeQtyOnchain, fetchPlpPx, fetchAskBounds, markRedeemPayout, type OracleSVI } from './predict.js';
import {
  buildOpenHedge, buildSettleHedge, buildSyncNav, pickHedgeStrike,
  fetchVaultState, hedgeBudgetMicro, plpValueMicro, fetchManagerBalanceMicro, fetchOpenPositions,
} from './roller.js';

/** Posisi hedge terakhir yg dibuka per oracle — untuk settle_hedge saat jatuh tempo. */
type HedgePos = { strike: number; isUp: boolean; qty: bigint; expiry: number };
const positions = new Map<string, HedgePos>(); // oracleId -> posisi terbuka

const DRY_RUN = (process.env.DRY_RUN ?? 'true') !== 'false';
const POLL_MS = Number(process.env.POLL_MS ?? 15000);
const DOWN_PCT = Number(process.env.HEDGE_STRIKE_DOWN_PCT ?? 0.08); // strike OTM = forward*(1-pct)
const MAX_POSITIONS = Number(process.env.MAX_POSITIONS ?? 1); // hedge satu expiry per roll
const MIN_TENOR_MS = Number(process.env.MIN_TENOR_MS ?? 30 * 60 * 1000); // lewati expiry < 30 mnt (volatil)
// Sisihkan buffer: qty disized thd budget*SAFETY agar mint_cost < dana yg di-fund (anti rounding/drift).
const SAFETY_BPS = BigInt(process.env.HEDGE_SAFETY_BPS ?? 9700); // 97%

function operator(): Ed25519Keypair {
  const pk = process.env.OPERATOR_PRIVATE_KEY;
  if (!pk) throw new Error('OPERATOR_PRIVATE_KEY belum diset');
  return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(pk).secretKey);
}

async function submit(tx: any, signer: Ed25519Keypair, label: string) {
  if (DRY_RUN) {
    tx.setSender(signer.toSuiAddress());
    const bytes = await tx.build({ client: sui });
    const res = await sui.dryRunTransactionBlock({ transactionBlock: bytes });
    console.log(`[dry] ${label}: ${res.effects.status.status}`);
    return;
  }
  const res = await sui.signAndExecuteTransaction({ transaction: tx, signer, options: { showEffects: true } });
  console.log(`[exec] ${label}: ${res.digest} ${res.effects?.status.status}`);
}

const handled = new Set<string>(); // oracle yang sudah di-settle

async function tick() {
  const kp = operator();
  let oracles: OracleSVI[] = [];
  try { oracles = await fetchOracles(); } catch (e) { console.warn('fetchOracles gagal:', (e as Error).message); return; }

  let vault;
  try { vault = await fetchVaultState(); } catch (e) { console.warn('fetchVaultState gagal:', (e as Error).message); return; }
  if (vault.paused) { console.log('vault paused — skip roll'); return; }

  // === NAV sync: harga PLP on-chain + nilai posisi → snapshot NAV ===
  let plpPx = vault.plpPx;
  try {
    const px = await fetchPlpPx();
    plpPx = px.plpPx;
    const plpVal = plpValueMicro(vault.plp, plpPx);
    const mgrBal = await fetchManagerBalanceMicro().catch(() => 0n);
    // Mark posisi hedge terbuka yang kita pegang (mark 0 bila oracle sudah settled/unquoteable).
    let hedgeMark = 0n;
    for (const [oid, pos] of positions) {
      if (pos.qty > 0n) {
        hedgeMark += await markRedeemPayout(oid, pos.expiry, pos.strike, pos.isUp, pos.qty).catch(() => 0n);
      }
    }
    const navMicro = vault.idle + plpVal + mgrBal + hedgeMark;
    vault.nav = navMicro; // pakai NAV segar untuk sizing budget di bawah
    console.log(
      `NAV ${(Number(navMicro) / 1e6).toFixed(2)} dUSDC = idle ${(Number(vault.idle) / 1e6).toFixed(2)} ` +
      `+ PLP ${(Number(plpVal) / 1e6).toFixed(2)} + mgr ${(Number(mgrBal) / 1e6).toFixed(2)} ` +
      `+ hedge ${(Number(hedgeMark) / 1e6).toFixed(2)} | plpPx ${(Number(plpPx) / 1e9).toFixed(6)}`,
    );
    await submit(buildSyncNav(Number(navMicro), Number(plpPx)), kp, 'sync_nav');
  } catch (e) { console.warn('sync_nav gagal:', (e as Error).message); }

  // === 1) Settle posisi yang oracle-nya sudah settled ===
  for (const o of oracles) {
    if (o.status === 'settled' && !handled.has(o.oracleId)) {
      handled.add(o.oracleId);
      const pos = positions.get(o.oracleId);
      if (!pos || pos.qty <= 0n) continue;
      console.log(`settle ${o.oracleId} @ ${o.settlementPrice} — redeem ${pos.qty} kontrak (strike ${pos.strike})`);
      await submit(buildSettleHedge(o.oracleId, pos.strike, pos.isUp, pos.qty), kp, 'settle_hedge');
      positions.delete(o.oracleId);
    }
  }

  // === 2) Buka hedge utk SATU expiry (nearest) per roll, batasi MAX_POSITIONS ===
  if (positions.size >= MAX_POSITIONS) return;
  const budget = hedgeBudgetMicro(vault, plpPx);
  if (budget <= 0n) { console.log('budget hedge 0 (NAV/PLP kosong) — skip open'); return; }

  // kandidat: aktif, harga terbaca, belum dipegang, tenor >= MIN_TENOR_MS — pilih yang paling dekat.
  const now = Date.now();
  const sizingBudget = (budget * SAFETY_BPS) / 10_000n; // qty disized thd ini; kontrak fund full budget
  const candidates = oracles
    .filter((o) => o.status === 'active' && !positions.has(o.oracleId) && (o.forward > 0 || o.spot > 0))
    .filter((o) => o.expiry - now >= MIN_TENOR_MS)
    .sort((a, b) => a.expiry - b.expiry);

  for (const o of candidates) {
    const ref = o.forward > 0 ? o.forward : o.spot;
    const { strike: desired, isUp } = pickHedgeStrike(o, DOWN_PCT);
    let sized;
    try {
      const bounds = await fetchAskBounds(o.oracleId);
      sized = await sizeHedgeQtyOnchain(sizingBudget, o.oracleId, o.expiry, desired, isUp, ref, o.tick, bounds);
    } catch (e) { console.warn(`sizing gagal ${o.oracleId}:`, (e as Error).message); continue; }
    if (!sized || sized.qty <= 0n) continue; // strike tak mintable utk expiry ini → coba berikutnya

    const costMicro = sized.unitCostMicro * Number(sized.qty);
    console.log(
      `OPEN hedge ${o.oracleId} (expiry ${new Date(o.expiry).toISOString()}) → DOWN strike ` +
      `${(sized.strike / 1e9).toFixed(0)} (diinginkan ${(desired / 1e9).toFixed(0)}): qty ${sized.qty}, ` +
      `cost ≈ ${(costMicro / 1e6).toFixed(2)} / budget ${(Number(budget) / 1e6).toFixed(2)} dUSDC`,
    );
    await submit(buildOpenHedge(o.oracleId, sized.strike, isUp, sized.qty), kp, 'open_hedge');
    if (!DRY_RUN) positions.set(o.oracleId, { strike: sized.strike, isUp, qty: sized.qty, expiry: o.expiry });
    return; // satu hedge per tick
  }
  console.log('tak ada oracle dgn strike mintable utk hedge saat ini');
}

async function main() {
  console.log(`Jaga keeper start — DRY_RUN=${DRY_RUN}, poll=${POLL_MS}ms`);
  // Rediscover posisi hedge dari PredictManager (restart-safe: tak double-hedge, NAV benar).
  try {
    const open = await fetchOpenPositions();
    for (const p of open) positions.set(p.oracleId, { strike: p.strike, isUp: p.isUp, qty: p.qty, expiry: p.expiry });
    console.log(`rediscovered ${open.length} posisi hedge on-chain`);
  } catch (e) { console.warn('rediscover posisi gagal:', (e as Error).message); }
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await tick().catch((e) => console.error('tick error:', e));
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
main();
