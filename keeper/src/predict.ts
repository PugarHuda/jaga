/**
 * Thin client untuk DeepBook Predict (testnet).
 *
 * Integrasi 3-layer sesuai docs:
 *  1. predict-server  -> daftar market, vault summary, posisi (untuk UI/keeper)
 *  2. event stream    -> OracleSVIUpdated / settlement (low-latency)
 *  3. on-chain reads  -> konfirmasi sebelum/sesudah PTB
 *
 * TODO(setelah riset interface): isi PACKAGE/REGISTRY/PREDICT id + signature
 * fungsi supply/mint/redeem dari branch predict-testnet-4-16.
 */
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';

export const PREDICT_SERVER = 'https://predict-server.testnet.mystenlabs.com';
const CLOCK = '0x6';
const FLOAT_SCALING = 1_000_000_000n; // deepbook::math fixed-point

// ⚠️ Provisional (branch predict-testnet-4-16) — konfirmasi ID deploy sebelum dipakai.
// Modul (verified dari source): predict, predict_manager, oracle, plp, market_key, range_key.
// PredictManager dibuat via predict::create_manager(ctx) -> shared, owner = sender.
// mint/redeem OWNER-GATED (sender == manager.owner) & dana lewat PredictManager (bukan Coin arg).
// supply/withdraw berbasis Coin<DUSDC> <-> Coin<PLP>, tidak owner-gated.
// MarketKey = (oracle_id, expiry, strike, direction) via market_key.new/up/down.
export const PREDICT = {
  packageId: '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138',
  registry: '0x43af14fed5480c20ff77e2263d5f794c35b9fab7e2212903127062f4fe2a6e64',
  predict: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
  plpType: '0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138::plp::PLP',
  dusdcType: '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
} as const;

export const sui = new SuiClient({ url: getFullnodeUrl('testnet') });

/** Bentuk mentah satu entri dari GET /oracles (predict-server testnet). */
type RawOracle = {
  oracle_id: string;
  underlying_asset: string;
  expiry: number;            // ms
  min_strike: number;        // skala harga 1e9
  tick_size: number;         // skala harga 1e9
  status: 'inactive' | 'active' | 'pending' | 'settled';
  settlement_price: number | null;
};

export type OracleSVI = {
  oracleId: string;
  asset: string;
  expiry: number;            // ms
  status: RawOracle['status'];
  minStrike: number;         // skala harga 1e9
  tick: number;              // skala harga 1e9
  spot: number;              // on-chain, skala 1e9 (0 jika gagal baca)
  forward: number;           // on-chain, skala 1e9
  settlementPrice?: number;
};

/**
 * Ambil oracle/market dari predict-server, lalu perkaya `active` dengan spot/forward
 * on-chain (list endpoint tak menyertakannya — dibutuhkan untuk pilih strike hedge).
 */
export async function fetchOracles(): Promise<OracleSVI[]> {
  const res = await fetch(`${PREDICT_SERVER}/oracles`);
  if (!res.ok) throw new Error(`predict-server ${res.status}`);
  const raw = (await res.json()) as RawOracle[];

  const out: OracleSVI[] = raw.map((o) => ({
    oracleId: o.oracle_id,
    asset: o.underlying_asset,
    expiry: o.expiry,
    status: o.status,
    minStrike: Number(o.min_strike),
    tick: Number(o.tick_size),
    spot: 0,
    forward: 0,
    settlementPrice: o.settlement_price ?? undefined,
  }));

  // Baca prices on-chain hanya untuk yang aktif (batch multiGetObjects).
  const active = out.filter((o) => o.status === 'active');
  if (active.length > 0) {
    const objs = await sui.multiGetObjects({
      ids: active.map((o) => o.oracleId),
      options: { showContent: true },
    });
    const byId = new Map(active.map((o) => [o.oracleId, o]));
    for (const obj of objs) {
      const f = (obj.data?.content as any)?.fields;
      const id = obj.data?.objectId;
      const e = id ? byId.get(id) : undefined;
      if (e && f?.prices?.fields) {
        e.spot = Number(f.prices.fields.spot);
        e.forward = Number(f.prices.fields.forward);
      }
    }
  }
  return out;
}

// === Quote on-chain via devInspect (read-only, tanpa gas/owner) ===

function decodeU64LE(bytes: number[] | Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

export type TradeQuote = { mintCost: bigint; redeemPayout: bigint };

/**
 * Panggil `predict::get_trade_amounts` lewat devInspect untuk `quantity` kontrak.
 * Mengembalikan (mint_cost, redeem_payout) dalam unit quote (dUSDC, 6 desimal).
 * MarketKey dibangun on-chain via `market_key::new` lalu di-pipe ke get_trade_amounts.
 */
export async function quoteTradeAmounts(
  oracleId: string,
  expiry: number,
  strike: number,
  isUp: boolean,
  quantity: bigint,
): Promise<TradeQuote> {
  const tx = new Transaction();
  const key = tx.moveCall({
    target: `${PREDICT.packageId}::market_key::new`,
    arguments: [tx.pure.id(oracleId), tx.pure.u64(BigInt(expiry)), tx.pure.u64(BigInt(strike)), tx.pure.bool(isUp)],
  });
  tx.moveCall({
    target: `${PREDICT.packageId}::predict::get_trade_amounts`,
    arguments: [tx.object(PREDICT.predict), tx.object(oracleId), key, tx.pure.u64(quantity), tx.object(CLOCK)],
  });
  const res = await sui.devInspectTransactionBlock({
    sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    transactionBlock: tx,
  });
  if (res.error) throw new Error(`devInspect get_trade_amounts: ${res.error}`);
  // moveCall ke get_trade_amounts adalah command terakhir; returnValues = [(bytes,type), (bytes,type)]
  const rv = res.results?.at(-1)?.returnValues;
  if (!rv || rv.length < 2) throw new Error('get_trade_amounts: returnValues kosong');
  return { mintCost: decodeU64LE(rv[0][0]), redeemPayout: decodeU64LE(rv[1][0]) };
}

/**
 * Harga PLP on-chain (dUSDC per 1e9 PLP), persis seperti rumus supply/withdraw Predict:
 *   plp_px = vault_value * 1e9 / plp_total_supply,  vault_value = vault.balance - total_mtm.
 * Baca langsung dari objek Predict (field nested), tak ada getter publik untuk ini.
 */
export async function fetchPlpPx(): Promise<{ plpPx: bigint; vaultValue: bigint; plpSupply: bigint }> {
  const o = await sui.getObject({ id: PREDICT.predict, options: { showContent: true } });
  const f = (o.data?.content as any)?.fields;
  if (!f) throw new Error('Predict object tak terbaca');
  const balance = BigInt(f.vault.fields.balance);
  const totalMtm = BigInt(f.vault.fields.total_mtm);
  const plpSupply = BigInt(f.treasury_cap.fields.total_supply.fields.value);
  const vaultValue = balance > totalMtm ? balance - totalMtm : 0n;
  const plpPx = plpSupply > 0n ? (vaultValue * FLOAT_SCALING) / plpSupply : FLOAT_SCALING;
  return { plpPx, vaultValue, plpSupply };
}

/**
 * Mark-to-market posisi binary terbuka: redeem_payout saat ini untuk `qty` kontrak (dUSDC micro).
 * Bila strike sudah ter-floor (deep-OTM near expiry) → bernilai ~0, kembalikan 0.
 */
export async function markRedeemPayout(
  oracleId: string,
  expiry: number,
  strike: number,
  isUp: boolean,
  qty: bigint,
): Promise<bigint> {
  if (qty <= 0n) return 0n;
  try {
    const q = await quoteTradeAmounts(oracleId, expiry, strike, isUp, qty);
    return q.redeemPayout;
  } catch (e) {
    if (isDeepOtmAbort((e as Error).message)) return 0n;
    throw e;
  }
}

const Q_REF = FLOAT_SCALING; // 1e9 unit probe — pada qty ini, mint_cost == ask_price (cost=ask*qty/1e9)

/** Abort sub_status 1 di pricing_config = fair_price ter-floor ke 0 (strike terlalu deep-OTM). */
function isDeepOtmAbort(msg: string): boolean {
  return msg.includes('pricing_config') && msg.includes('Some(1)');
}

/**
 * Batas harga ask (premi per-kontrak, skala 1e9) yang BOLEH di-mint untuk oracle ini.
 * `predict::mint` abort EAskPriceOutOfBounds (kode 7) bila ask < min atau > max.
 * Default protokol: min 1e7 (≈1% notional), max 9.9e8 (≈99%).
 */
export async function fetchAskBounds(oracleId: string): Promise<{ minAsk: bigint; maxAsk: bigint }> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICT.packageId}::predict::ask_bounds`,
    arguments: [tx.object(PREDICT.predict), tx.pure.id(oracleId)],
  });
  const res = await sui.devInspectTransactionBlock({
    sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
    transactionBlock: tx,
  });
  if (res.error) throw new Error(`devInspect ask_bounds: ${res.error}`);
  const rv = res.results?.at(-1)?.returnValues;
  if (!rv || rv.length < 2) throw new Error('ask_bounds: returnValues kosong');
  return { minAsk: decodeU64LE(rv[0][0]), maxAsk: decodeU64LE(rv[1][0]) };
}

/**
 * Cari strike OTM-down TERDALAM yang MINTABLE: ask (mint_cost @Q_REF) berada dalam [minAsk,maxAsk].
 * Mulai dari `desiredStrike` lalu melangkah ke arah `forward` (down: strike naik). Strike terlalu
 * jauh → fair_price=0 (abort) atau ask < minAsk → terlalu murah utk di-mint; melangkah menaikkan ask
 * sampai masuk band. Inilah proteksi crash terdalam yang masih boleh dibeli di Predict.
 */
export async function findQuotableStrike(
  oracleId: string,
  expiry: number,
  desiredStrike: number,
  isUp: boolean,
  forward: number,
  tick: number,
  bounds: { minAsk: bigint; maxAsk: bigint },
  maxSteps = 80,
): Promise<{ strike: number; quote: TradeQuote } | null> {
  const step = Math.max(tick, Math.floor((forward * 0.005) / tick) * tick); // ~0.5% forward, kelipatan tick
  let strike = desiredStrike;
  for (let i = 0; i < maxSteps && strike < forward; i++) {
    try {
      const quote = await quoteTradeAmounts(oracleId, expiry, strike, isUp, Q_REF);
      // mint_cost @Q_REF == ask_price; mintable hanya jika di dalam band.
      if (quote.mintCost >= bounds.minAsk && quote.mintCost <= bounds.maxAsk) return { strike, quote };
      if (quote.mintCost > bounds.maxAsk) return null; // sudah terlalu dekat forward (terlalu mahal)
    } catch (e) {
      if (!isDeepOtmAbort((e as Error).message)) throw e; // abort lain → naikkan strike
    }
    strike += step; // geser menuju forward (down-strike makin dangkal → ask naik)
  }
  return null;
}

/**
 * Sizing qty hedge agar mint_cost ≈ budget (semua dalam dUSDC micro).
 * Karena cost = mul(ask, qty) linear di qty, satu probe sudah eksak.
 * Mencari dulu strike quotable terdalam (lihat findQuotableStrike).
 */
export async function sizeHedgeQtyOnchain(
  budgetMicro: bigint,
  oracleId: string,
  expiry: number,
  desiredStrike: number,
  isUp: boolean,
  forward: number,
  tick: number,
  bounds: { minAsk: bigint; maxAsk: bigint },
): Promise<{ qty: bigint; strike: number; unitCostMicro: number; quote: TradeQuote } | null> {
  if (budgetMicro <= 0n) return null;
  const found = await findQuotableStrike(oracleId, expiry, desiredStrike, isUp, forward, tick, bounds);
  if (!found) return null;
  const qty = (budgetMicro * Q_REF) / found.quote.mintCost; // floor(budget * Q_REF / cost_ref)
  const unitCostMicro = Number(found.quote.mintCost) / Number(Q_REF);
  return { qty, strike: found.strike, unitCostMicro, quote: found.quote };
}
