import { Transaction } from '@mysten/sui/transactions';

export const CFG = {
  pkg: process.env.NEXT_PUBLIC_JAGA_PKG ?? '0x0',
  vault: process.env.NEXT_PUBLIC_JAGA_VAULT ?? '0x0',
  predict: process.env.NEXT_PUBLIC_PREDICT ?? '0x0',
  dusdcType: process.env.NEXT_PUBLIC_DUSDC_TYPE ?? '0x0::dusdc::DUSDC',
  clock: '0x6',
};

/** Deposit: split dUSDC dari coin user → vault::deposit → transfer Coin<SHARE> ke user. */
export function buildDeposit(owner: string, dusdcCoinId: string, amount: bigint): Transaction {
  const tx = new Transaction();
  const [pay] = tx.splitCoins(tx.object(dusdcCoinId), [tx.pure.u64(amount)]);
  const share = tx.moveCall({
    target: `${CFG.pkg}::vault::deposit`,
    arguments: [tx.object(CFG.vault), tx.object(CFG.predict), pay, tx.object(CFG.clock)],
  });
  tx.transferObjects([share], owner);
  return tx;
}

/** Withdraw: vault::withdraw(Coin<SHARE>) → Coin<DUSDC> → transfer ke user. */
export function buildWithdraw(owner: string, shareCoinId: string): Transaction {
  const tx = new Transaction();
  const out = tx.moveCall({
    target: `${CFG.pkg}::vault::withdraw`,
    arguments: [tx.object(CFG.vault), tx.object(CFG.predict), tx.object(shareCoinId), tx.object(CFG.clock)],
  });
  tx.transferObjects([out], owner);
  return tx;
}

/** Parse field NAV/plp_px/hedge_ratio dari objek Vault (content.fields). */
export function parseVault(fields: any) {
  const nav = Number(fields?.nav ?? 0) / 1e6;
  const shares = Number(fields?.cap?.fields?.total_supply?.fields?.value ?? 0) / 1e6;
  return {
    nav,
    plpPx: Number(fields?.plp_px ?? 0) / 1e9,
    hedgeRatioBps: Number(fields?.hedge_ratio_bps ?? 0),
    plp: Number(fields?.plp ?? 0) / 1e6,
    idle: Number(fields?.idle ?? 0) / 1e6,
    shares,
    navPerShare: shares > 0 ? nav / shares : 1,
    paused: Boolean(fields?.paused ?? false),
  };
}
