<p align="center"><img src="web/public/logo.png" width="128" alt="Jaga"></p>

# Jaga 🛡️

**PLP yield, minus crash insurance — in one composable token.**

🔗 **Live demo:** https://jaga-eta.vercel.app · **Repo:** https://github.com/PugarHuda/jaga

Jaga is an automated vault on **DeepBook Predict** (Sui's prediction/options protocol with a live volatility surface). The vault supplies dUSDC to Predict's LP pool to harvest **PLP yield**, and simultaneously buys **OTM binary options** as **crash insurance** that pays off exactly when PLP bleeds. The result: LP yield with a **capped left-tail drawdown**, wrapped as a **composable share token** that auto-rolls each expiry.

> Sui Overflow 2026 — Track: **DeepBook Predict** ($35k 1st prize).

## Why it needs to exist

**PLP holders are effectively "the house"** on DeepBook Predict — the PLP pool takes the other side of every trade. When markets are calm, PLP eats premium (nice yield). When BTC moves violently, binary-trader payouts hit PLP hard (**left-tail risk**). That is what keeps serious LPs out: *"Is PLP safe?"*

**Jaga answers it:** you still earn PLP yield, but crash drawdown is capped by the hedge leg. Far easier to sell to outside LPs than raw PLP.

## How it works (two legs, one position)

| | Leg 1 — Yield | Leg 2 — Hedge |
|---|---|---|
| Action | `predict::supply` dUSDC → receive **PLP** | `predict::mint` buy **OTM binary** |
| Profits when | Markets calm | Markets crash |
| Costs when | Crash (PLP pays the payout) | Calm (hedge premium expires) |

Net = a smoother return curve with a bounded drawdown. Design parameters: **hedge ratio** (static bps / dynamic from utilization & realized vol) and **strike policy** (e.g. 1σ off the SVI surface).

## Novelty

No product occupies this cell — on Sui or in DeFi broadly. DOVs (Ribbon/Aevo) **sell** protection; hedged-LP vaults (Rage/Umami) only hedge delta with perps; principal-protected notes (Typus SAFU/Cega) are lending + upside options. Jaga = **house-pool LP yield + buying OTM binaries as a crash hedge + one composable share token**, native to DeepBook Predict. See `docs/ARCHITECTURE.md`.

## Repo structure

```
contracts/   # Move package "jaga": vault, share token, events
keeper/      # Auto-roll bot + settlement monitor + NAV sync (TypeScript)
sim/         # Backtest / Monte-Carlo simulation (vault credibility proof)
web/         # Deposit/withdraw dashboard + APY net-of-insurance (Next.js)
docs/        # ARCHITECTURE.md, DEPLOYMENTS.md, PROOF.md, TASKS.md
```

## Live on testnet ✅

The full lifecycle — **deposit → supply PLP → sync NAV → hedge (via PLP redeem) → settle** — runs
end-to-end on **Sui testnet** against the real DeepBook Predict contracts. Full proof + transaction
digests: [`docs/PROOF.md`](docs/PROOF.md).

| Object | ID |
|---|---|
| Package `jaga` | `0x23055600fa07417c0932cb3ec82b5f453ef12c3daadd20d0e55d51698e05c714` |
| Vault (shared) | `0xc2689d4a61bd26089cb4149ee1fa41284527bdefebeab233e404358aceeac03a` |

Technical highlights (see PROOF):
- **Trustless yield leg** — `predict::supply` is coin-based, fully inside the Vault.
- **Hedge leg** — `predict::mint` is *owner-gated* and its funds flow through the internal
  PredictManager, so the Vault **redeems PLP → dUSDC → funds the PredictManager → mints an OTM-DOWN
  binary**. The strike auto-steps to the deepest *mintable* level (Predict floors ask ≈ 1% notional).
- **NAV** is computed exactly like Predict's `supply`/`withdraw` math (`vault_value / PLP_supply`).
- **Restart-safe keeper** — open positions are rediscovered from the PredictManager's `Table<MarketKey,u64>`.

## Run it yourself

```bash
# Contracts
cd contracts && sui move test --allow-dirty

# Keeper (operator key in keeper/.env)
cd keeper && npm install
npx tsx --env-file=.env src/e2e.ts state              # read NAV/PLP/share
DRY_RUN=true npx tsx --env-file=.env src/index.ts     # keeper loop (simulated)

# Dashboard
cd web && npm install && npm run dev                   # http://localhost:3000
```

## Status

Live on testnet (Sui Overflow 2026, DeepBook Predict track). See `docs/TASKS.md` for progress.
