/**
 * E2E harness Jaga di testnet (operator key dari .env).
 *   tsx --env-file=.env src/e2e.ts state              # cetak NAV/PLP/share supply
 *   tsx --env-file=.env src/e2e.ts deposit 50         # setor 50 dUSDC -> jSHARE
 *   tsx --env-file=.env src/e2e.ts withdraw           # tarik semua jSHARE -> dUSDC
 *
 * Membuktikan kaki PLP (deposit/withdraw, trustless) end-to-end. Kaki hedge dijalankan
 * keeper (index.ts) saat NAV>0. Memakai dUSDC milik operator (testnet, dapat di-faucet ulang).
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { sui, PREDICT } from './predict.js';
import { JAGA } from './roller.js';

const CLOCK = '0x6';
const DUSDC = PREDICT.dusdcType;
const SHARE = `${JAGA.pkg}::share::SHARE`;

function operator(): Ed25519Keypair {
  const pk = process.env.OPERATOR_PRIVATE_KEY;
  if (!pk) throw new Error('OPERATOR_PRIVATE_KEY belum diset');
  return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(pk).secretKey);
}

async function printState(addr: string) {
  const o = await sui.getObject({ id: JAGA.vault, options: { showContent: true } });
  const f = (o.data?.content as any)?.fields;
  console.log('— Vault —');
  console.log(`  NAV        ${(Number(f.nav) / 1e6).toFixed(6)} dUSDC`);
  console.log(`  idle       ${(Number(f.idle) / 1e6).toFixed(6)} dUSDC`);
  console.log(`  PLP held   ${(Number(f.plp) / 1e6).toFixed(6)} PLP`);
  console.log(`  plp_px     ${(Number(f.plp_px) / 1e9).toFixed(6)} dUSDC/PLP`);
  const dusdc = await sui.getBalance({ owner: addr, coinType: DUSDC });
  const share = await sui.getBalance({ owner: addr, coinType: SHARE });
  console.log('— Operator wallet —');
  console.log(`  dUSDC      ${(Number(dusdc.totalBalance) / 1e6).toFixed(6)}`);
  console.log(`  jSHARE     ${(Number(share.totalBalance) / 1e6).toFixed(6)}`);
}

async function deposit(amount: number, kp: Ed25519Keypair) {
  const addr = kp.toSuiAddress();
  const micro = BigInt(Math.floor(amount * 1e6));
  const coins = await sui.getCoins({ owner: addr, coinType: DUSDC });
  if (!coins.data.length) throw new Error('operator tak punya coin dUSDC');
  const tx = new Transaction();
  // gabungkan semua coin dUSDC lalu split jumlah setor (robust thd banyak coin kecil)
  const [primary, ...rest] = coins.data;
  if (rest.length) tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
  const [pay] = tx.splitCoins(tx.object(primary.coinObjectId), [tx.pure.u64(micro)]);
  const share = tx.moveCall({
    target: `${JAGA.pkg}::vault::deposit`,
    arguments: [tx.object(JAGA.vault), tx.object(PREDICT.predict), pay, tx.object(CLOCK)],
  });
  tx.transferObjects([share], addr);
  const res = await sui.signAndExecuteTransaction({ transaction: tx, signer: kp, options: { showEffects: true } });
  console.log(`deposit ${amount} dUSDC -> ${res.digest} ${res.effects?.status.status}`);
  if (res.effects?.status.status !== 'success') console.log(JSON.stringify(res.effects?.status));
}

async function withdraw(kp: Ed25519Keypair) {
  const addr = kp.toSuiAddress();
  const shares = await sui.getCoins({ owner: addr, coinType: SHARE });
  if (!shares.data.length) throw new Error('operator tak punya jSHARE');
  const tx = new Transaction();
  const [primary, ...rest] = shares.data;
  if (rest.length) tx.mergeCoins(tx.object(primary.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
  const out = tx.moveCall({
    target: `${JAGA.pkg}::vault::withdraw`,
    arguments: [tx.object(JAGA.vault), tx.object(PREDICT.predict), tx.object(primary.coinObjectId), tx.object(CLOCK)],
  });
  tx.transferObjects([out], addr);
  const res = await sui.signAndExecuteTransaction({ transaction: tx, signer: kp, options: { showEffects: true } });
  console.log(`withdraw all jSHARE -> ${res.digest} ${res.effects?.status.status}`);
  if (res.effects?.status.status !== 'success') console.log(JSON.stringify(res.effects?.status));
}

async function main() {
  const kp = operator();
  const addr = kp.toSuiAddress();
  const [cmd, arg] = process.argv.slice(2);
  console.log(`operator ${addr}  | vault ${JAGA.vault}\n`);
  if (cmd === 'deposit') { await deposit(Number(arg ?? '50'), kp); console.log(); await printState(addr); }
  else if (cmd === 'withdraw') { await withdraw(kp); console.log(); await printState(addr); }
  else { await printState(addr); }
}
main().catch((e) => { console.error('ERR', e.message ?? e); process.exit(1); });
