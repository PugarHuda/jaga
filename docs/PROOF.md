# Jaga — Live Testnet Proof (2026-06-18)

Full deposit → supply → NAV-sync → hedge (via PLP redemption) → settle lifecycle executed
end-to-end on **Sui testnet** against the real DeepBook Predict contracts. Every entry point
exercised on-chain (not mocked). Explorer: https://suiscan.xyz/testnet

| Step | What it proves | Tx digest |
|---|---|---|
| `publish` | Jaga package live (hedge-funding fix) | `JDDGg1wNnVe5JUbbt1F6QXrtaQaTRcy8qy2yNkLRUnSz` |
| `vault::create` | Vault + Admin/Keeper caps created | `7WCziB8zz1EdpC1oK8s85UCnxuRuVKZQHoEm1yaQ6FHU` |
| `vault::deposit` (50 dUSDC) | dUSDC → `predict::supply` → PLP held by Vault; 50 jSHARE minted (trustless leg) | `DMDP2tysmx1LnioJj2YtYZHE2nDJStu77NcFNApxv3La` |
| `vault::sync_nav` | Keeper marks NAV from on-chain PLP price + position marks | `264rEHkLGssumKegh5L8r5uwXfFGoKFcmmtsz6tZCKaL` |
| `vault::open_hedge` (25%) | **Hedge funded by redeeming PLP** → `predict::mint` binary OTM-DOWN | `9NSU8wedzJqdbsvvbKEGHHcEtgFZzqTKW9X5Cn8cDpT6` |
| `vault::set_params` | Hedge ratio retuned 25% → 2% (realistic per-roll premium) | (AdminCap) |
| `vault::sync_nav` | Re-mark after first hedge expired OTM | `HUMEwdgqGZ4H7YiF7nPo6sSJp3PudQaL9Jk12fZpr29n` |
| `vault::open_hedge` (2%) | Fresh hedge at realistic premium (0.73 dUSDC) | `DyQ2yNwxtFGsx5iW12McMuMrYSv62xHSNpuyk4FSyXvV` |

## What the run demonstrated
- **Trustless PLP leg:** deposit of 50 dUSDC supplied to Predict's PLP pool; Vault holds `Balance<PLP>`;
  `Coin<SHARE>` (jSHARE, composable) minted 1:1 at NAV. Withdraw redeems PLP back to dUSDC.
- **Operator-executed hedge leg:** because `predict::mint` is owner-gated and pulls funds from the
  PredictManager's internal balance, the Vault **redeems PLP → dUSDC → funds the PredictManager →
  mints** an OTM-DOWN binary as crash insurance. Strike auto-steps to the deepest *mintable* level
  (Predict enforces an ask-price floor ≈ 1% of notional via `EAskPriceOutOfBounds`).
- **NAV marking:** `plp_px` computed exactly as Predict's `supply`/`withdraw` math
  (`vault_value / PLP_supply`); NAV = idle + PLP value + PredictManager balance + open-hedge bid mark.
- **Insurance economics, honestly marked:** first hedge expired OTM (BTC settled 64188.96 > strike 64102),
  so the premium was lost — exactly what crash insurance costs when no crash occurs. NAV reflects it.
  The 30k-path simulation (see `sim/`) shows the net effect: ~16pt better CVaR-1% for ~1% yield given up.
- **Keeper restart-safety:** open positions are rediscovered from the PredictManager's
  `Table<MarketKey,u64>` on startup, so the keeper never double-hedges and NAV marks stay correct.

Run the harness yourself (operator key in `keeper/.env`):
```
cd keeper
npx tsx --env-file=.env src/e2e.ts state          # NAV / PLP / shares
npx tsx --env-file=.env src/e2e.ts deposit 50     # deposit
npx tsx --env-file=.env src/e2e.ts withdraw       # redeem all jSHARE
DRY_RUN=false npx tsx --env-file=.env src/index.ts  # keeper: sync_nav + roll hedge
```
