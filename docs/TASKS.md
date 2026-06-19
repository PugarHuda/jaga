# Jaga — Breakdown Kerja (target submit 21 Juni)

Empat lajur paralel. Tandai progress di sini.

## Lajur A — Move / kontrak
- [x] A1. Scaffold package `jaga` + `Move.toml` deps (Sui + Predict `predict-testnet-4-16` + OZ math)
- [x] A2. `share.move` (OTW SHARE, currency, freeze metadata)
- [x] A3. `events.move`
- [x] A4. `vault.move`: Vault/AdminCap/KeeperCap, `create`, `deposit`, `withdraw`, `open_hedge`/`settle_hedge` — nempel ke signature Predict asli. **FIX 18 Jun: `open_hedge` kini menebus PLP utk premi (idle=0 setelah deposit).**
- [x] A5. NAV/valuasi (PLP via `vault_value/PLP_supply` + bid-mark binary) + akunting share (mul_div). Dihitung keeper, di-push `sync_nav`.
- [x] A6. Unit test (`sui move test --allow-dirty`) hijau (1 pass)
- [x] A7. Publish ke testnet → pkg `0x2305…c714`, vault `0xc268…c03a` (lihat DEPLOYMENTS.md, PROOF.md)

## Lajur B — Keeper / backend
- [x] B1. Client `predict.ts` (predict-server `/oracles` + spot/forward on-chain). Tipe `OracleSVI` cocok dgn schema server nyata.
- [x] B2. Watcher settlement: poll `/oracles`, status `settled` → `settle_hedge` (posisi dilacak lokal per-oracle); status `active` → `open_hedge`.
- [x] B3. Strike selector: OTM-down = forward*(1-pct), snap ke tick; **otomatis melangkah ke strike quotable terdalam** bila deep-OTM (fair_price=0 abort di expiry pendek). Verified live.
- [x] B4. Qty sizing via `predict::get_trade_amounts` (devInspect, decode BCS) → cost ≈ budget EKSAK (linear). Submit PTB open/settle via KeeperCap; DRY_RUN kill-switch; budget=nav*ratio capped idle. **tsc hijau + dry-run loop hijau di testnet.**

## Lajur C — Simulasi (bukti vault, WAJIB track)
- [x] C1. Monte-Carlo BTC path (30k paths, 96 cycles) + model PnL PLP vs Jaga → `sim/out/summary.json`
- [x] C2. Sweep hedge_ratio (0→5000bps) → kurva "yield hilang vs drawdown ditekan" → `sim/out/sweep.csv`
- [x] C3. Output grafik (dashboard distribusi PnL D3) + tabel ringkas (sweep.csv) untuk pitch
- [ ] C4. (Opsional) anchor report ke Walrus blob

## Lajur D — Frontend / dashboard
- [x] D1. Scaffold Next.js + `@mysten/dapp-kit` (ConnectButton)
- [x] D2. Deposit/withdraw flow (build PTB, sign, execute) — **fix: `NEXT_PUBLIC_PREDICT` = objek Predict, bukan package**
- [x] D3. Panel NAV / harga-per-share / Harga PLP / grafik distribusi PnL vs PLP mentah
- [x] D4. Polish UX: status tx (ok/err), refetch on-success, stat harga/jSHARE. `npm run build` hijau.

## Lajur E — Submission
- [~] E1. Demo video ≤5 menit — **skrip + storyboard siap di `docs/SUBMISSION.md` §5**; tinggal rekam.
- [x] E2. Logo 1:1 dibuat → `web/public/logo.svg` (icon 512×512) + `web/public/logo-wordmark.svg`. Deskripsi/tagline siap di SUBMISSION.md. **TODO submit: export SVG→PNG** (buka di browser, save as PNG, atau pakai online converter) bila form DeepSurge minta raster.
- [x] E3. dUSDC testnet — **operator sudah pegang 200 dUSDC; deposit/hedge live terbukti** (PROOF.md).
- [ ] E4. Submit DeepSurge sebelum 21 Juni 6PM PT; tim ≥2 terdaftar; profil mahasiswa (University Award)
```
