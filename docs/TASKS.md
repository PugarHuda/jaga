# Jaga — Work Breakdown (target submit June 21)

Four parallel tracks. Mark progress here.

## Track A — Move / contract
- [x] A1. Scaffold package `jaga` + `Move.toml` deps (Sui + Predict `predict-testnet-4-16` + OZ math)
- [x] A2. `share.move` (OTW SHARE, currency, freeze metadata)
- [x] A3. `events.move`
- [x] A4. `vault.move`: Vault/AdminCap/KeeperCap, `create`, `deposit`, `withdraw`, `open_hedge`/`settle_hedge` — wired to the real Predict signature. **FIX Jun 18: `open_hedge` now redeems PLP for the premium (idle=0 after deposit).**
- [x] A5. NAV/valuation (PLP via `vault_value/PLP_supply` + bid-mark binary) + share accounting (mul_div). Computed by keeper, pushed via `sync_nav`.
- [x] A6. Unit test (`sui move test --allow-dirty`) green (1 pass)
- [x] A7. Publish to testnet → pkg `0x2305…c714`, vault `0xc268…c03a` (see DEPLOYMENTS.md, PROOF.md)

## Track B — Keeper / backend
- [x] B1. Client `predict.ts` (predict-server `/oracles` + spot/forward on-chain). The `OracleSVI` type matches the real server schema.
- [x] B2. Settlement watcher: poll `/oracles`, status `settled` → `settle_hedge` (positions tracked locally per-oracle); status `active` → `open_hedge`.
- [x] B3. Strike selector: OTM-down = forward*(1-pct), snap to tick; **automatically steps to the deepest quotable strike** when deep-OTM (fair_price=0 aborts at short expiry). Verified live.
- [x] B4. Qty sizing via `predict::get_trade_amounts` (devInspect, decode BCS) → cost ≈ EXACT budget (linear). Submit PTB open/settle via KeeperCap; DRY_RUN kill-switch; budget=nav*ratio capped to idle. **tsc green + dry-run loop green on testnet.**

## Track C — Simulation (vault proof, MANDATORY track)
- [x] C1. Monte-Carlo BTC path (30k paths, 96 cycles) + PnL model PLP vs Jaga → `sim/out/summary.json`
- [x] C2. Sweep hedge_ratio (0→5000bps) → "yield lost vs drawdown suppressed" curve → `sim/out/sweep.csv`
- [x] C3. Output charts (D3 PnL distribution dashboard) + summary table (sweep.csv) for the pitch
- [ ] C4. (Optional) anchor report to a Walrus blob

## Track D — Frontend / dashboard
- [x] D1. Scaffold Next.js + `@mysten/dapp-kit` (ConnectButton)
- [x] D2. Deposit/withdraw flow (build PTB, sign, execute) — **fix: `NEXT_PUBLIC_PREDICT` = the Predict object, not the package**
- [x] D3. NAV / price-per-share / PLP price / PnL distribution chart vs raw PLP panel
- [x] D4. Polish UX: tx status (ok/err), refetch on-success, price/jSHARE stats. `npm run build` green.

## Track E — Submission
- [~] E1. Demo video ≤5 minutes — **script + storyboard ready in `docs/SUBMISSION.md` §5**; just need to record.
- [x] E2. Logo 1:1 done → `web/public/logo.png` (1024×1024 raster) + `logo.svg` + `logo-wordmark.png/svg` (teal brand). Description/tagline ready in SUBMISSION.md.
- [x] E3. dUSDC testnet — **operator already holds 200 dUSDC; deposit/hedge proven live** (PROOF.md).
- [ ] E4. Submit DeepSurge before June 21 6PM PT; team ≥2 registered; student profiles (University Award)
