/**
 * Pembangun PTB untuk aksi keeper Jaga: open_hedge / settle_hedge / sync_nav.
 * Ditandatangani OPERATOR (pemilik PredictManager) karena predict::mint/redeem owner-gated.
 */
import { Transaction } from '@mysten/sui/transactions';
import { PREDICT, sui, type OracleSVI } from './predict.js';

const CLOCK = '0x6';
const BPS = 10_000n;

export const JAGA = {
  pkg: process.env.JAGA_PKG ?? '0x0',
  vault: process.env.JAGA_VAULT ?? '0x0',
  keeperCap: process.env.JAGA_KEEPER_CAP ?? '0x0',
  manager: process.env.JAGA_MANAGER ?? '0x0',
};

const PLP_SCALE = 1_000_000_000n;

export type VaultState = {
  nav: bigint;
  plpPx: bigint;
  hedgeRatioBps: bigint;
  idle: bigint;
  plp: bigint;        // saldo PLP (unit PLP) dipegang vault
  paused: boolean;
};

/** Baca field Vault on-chain (untuk budget hedge & NAV sync). */
export async function fetchVaultState(): Promise<VaultState> {
  const obj = await sui.getObject({ id: JAGA.vault, options: { showContent: true } });
  const f = (obj.data?.content as any)?.fields;
  if (!f) throw new Error('Vault tak ditemukan / bukan Move object');
  return {
    nav: BigInt(f.nav),
    plpPx: BigInt(f.plp_px),
    hedgeRatioBps: BigInt(f.hedge_ratio_bps),
    idle: BigInt(f.idle),
    plp: BigInt(f.plp),
    paused: !!f.paused,
  };
}

/** Nilai PLP yang dipegang vault dalam dUSDC micro, pakai plpPx (1e9 scale) terbaru. */
export function plpValueMicro(plp: bigint, plpPx: bigint): bigint {
  return (plp * plpPx) / PLP_SCALE;
}

/**
 * Budget hedge per roll = nav * hedge_ratio_bps / 1e4, dibatasi dana yang bisa dicairkan
 * (idle + nilai PLP) karena open_hedge mencairkan PLP untuk premi.
 */
export function hedgeBudgetMicro(v: VaultState, plpPx: bigint): bigint {
  const budget = (v.nav * v.hedgeRatioBps) / BPS;
  const deployable = v.idle + plpValueMicro(v.plp, plpPx);
  return budget <= deployable ? budget : deployable;
}

export type OpenPos = { oracleId: string; strike: number; isUp: boolean; qty: bigint; expiry: number };

/**
 * Rediscover posisi hedge terbuka langsung dari PredictManager on-chain (Table<MarketKey,u64>).
 * Bikin keeper restart-safe: tak double-hedge & NAV mark-nya benar setelah restart.
 */
export async function fetchOpenPositions(): Promise<OpenPos[]> {
  const m = await sui.getObject({ id: JAGA.manager, options: { showContent: true } });
  const tblId = (m.data?.content as any)?.fields?.positions?.fields?.id?.id as string | undefined;
  if (!tblId) return [];
  const out: OpenPos[] = [];
  let cursor: string | null | undefined = undefined;
  do {
    const page = await sui.getDynamicFields({ parentId: tblId, cursor: cursor ?? null });
    for (const e of page.data) {
      const k = (e.name as any).value as { oracle_id: string; expiry: string; strike: string; direction: number };
      const fo = await sui.getDynamicFieldObject({ parentId: tblId, name: e.name });
      const qty = BigInt((fo.data?.content as any)?.fields?.value ?? 0);
      if (qty > 0n) {
        out.push({
          oracleId: k.oracle_id,
          strike: Number(k.strike),
          isUp: k.direction === 0,
          qty,
          expiry: Number(k.expiry),
        });
      }
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);
  return out;
}

/** Saldo dUSDC menganggur di PredictManager (devInspect predict_manager::balance<DUSDC>). */
export async function fetchManagerBalanceMicro(): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT.packageId}::predict_manager::balance`,
    typeArguments: [PREDICT.dusdcType],
    arguments: [tx.object(JAGA.manager)],
  });
  const res = await sui.devInspectTransactionBlock({
    sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    transactionBlock: tx,
  });
  const rv = res.results?.at(-1)?.returnValues;
  if (!rv || rv.length < 1) return 0n;
  const bytes = rv[0][0] as number[];
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

/**
 * Pilih strike hedge OTM-down (proteksi crash): `downPct` di bawah forward, di-snap ke tick grid
 * dan dibatasi >= min_strike. is_up=false → payout saat harga jatuh di bawah strike.
 * Skala harga sama dgn oracle (1e9). Strike di luar grid menyebabkan pricing model abort,
 * jadi snapping wajib.
 */
export function pickHedgeStrike(o: OracleSVI, downPct: number): { strike: number; isUp: boolean } {
  const ref = o.forward > 0 ? o.forward : o.spot;
  const target = ref * (1 - downPct);
  const snapped = Math.floor(target / o.tick) * o.tick;
  const strike = Math.max(o.minStrike, snapped);
  return { strike, isUp: false };
}

export function buildOpenHedge(oracleId: string, strike: number, isUp: boolean, qty: bigint): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${JAGA.pkg}::vault::open_hedge`,
    arguments: [
      tx.object(JAGA.vault), tx.object(PREDICT.predict), tx.object(JAGA.manager),
      tx.object(oracleId), tx.object(JAGA.keeperCap),
      tx.pure.u64(strike), tx.pure.bool(isUp), tx.pure.u64(qty), tx.object(CLOCK),
    ],
  });
  return tx;
}

export function buildSettleHedge(settledOracleId: string, strike: number, isUp: boolean, qty: bigint): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${JAGA.pkg}::vault::settle_hedge`,
    arguments: [
      tx.object(JAGA.vault), tx.object(PREDICT.predict), tx.object(JAGA.manager),
      tx.object(settledOracleId), tx.object(JAGA.keeperCap),
      tx.pure.u64(strike), tx.pure.bool(isUp), tx.pure.u64(qty), tx.object(CLOCK),
    ],
  });
  return tx;
}

export function buildSyncNav(newNav: number, newPlpPx: number): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${JAGA.pkg}::vault::sync_nav`,
    arguments: [tx.object(JAGA.vault), tx.object(JAGA.keeperCap), tx.pure.u64(newNav), tx.pure.u64(newPlpPx)],
  });
  return tx;
}
