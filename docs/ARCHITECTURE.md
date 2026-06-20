# Jaga — Technical Architecture

## 1. Components

```
┌─────────────┐   deposit dUSDC    ┌──────────────────────────────┐
│   User /    │ ─────────────────► │  Vault (shared object, Move) │
│  Dashboard  │ ◄───────────────── │  - Balance<DUSDC> idle       │
└─────────────┘   mint Coin<SHARE> │  - TreasuryCap<SHARE>        │
       ▲                           │  - PredictManager (wrapped)  │
       │ APY/NAV, drawdown         │  - hedge positions (dyn flds)│
       │                           └───────────┬──────────────────┘
┌──────┴───────┐  events / server   atomic PTB │ supply + mint + redeem
│   Keeper     │ ◄───────────────┐             ▼
│ (auto-roll)  │                 │   ┌──────────────────────────┐
└──────┬───────┘                 └───┤   DeepBook Predict        │
       │ predict-server + OracleSVIUpdated │  predict::supply (PLP)  │
       ▼                              │  predict::mint  (binary)  │
   on-chain redeem_permissionless     │  predict::redeem          │
                                      │  OracleSVI (spot/SVI)     │
                                      └──────────────────────────┘
```

## 2. On-chain objects & state

- **`Vault`** (shared): `idle: Balance<DUSDC>`, `cap: TreasuryCap<SHARE>`, `manager: PredictManager` (or a reference + TradeProof), `total_shares: u64`, `hedge_ratio_bps: u64`, `strike_policy: u8`, `current_expiry: u64`, and **dynamic fields** `expiry -> HedgeLot` to track the binary per cycle.
- **`AdminCap`** (owned): set parameters (hedge ratio, strike policy, pause), create the vault.
- **`KeeperCap`** (owned): may only call `roll()` (settle + re-deploy). Can be delegated to a bot without granting admin authority.
- **`SHARE`** = OTW coin (`jaga::share::SHARE`), share token `Coin<SHARE>` (has `store` → composable).

## 3. NAV & share accounting (ERC4626-style)

```
NAV = value(PLP held)            // from Predict (redeemable value / mark)
    + value(hedge binaries)      // from OracleSVI mark, per position
    + idle dUSDC

deposit(assets):
    shares = (total_shares == 0)
        ? assets
        : mul_div(assets, total_shares, NAV)   // OZ math, no overflow
    mint Coin<SHARE>(shares)

withdraw(shares):
    assets = mul_div(shares, NAV, total_shares)
    burn shares; return proportional dUSDC (+ unwind pro-rata if needed)
```

PLP & binary valuation uses Predict view functions / the `OracleSVI` mark. The parts that need off-chain data (precise mark price) are fed via the keeper during `roll()`; intra-epoch deposit/withdraw uses the last snapshotted NAV to stay safe from manipulation.

## 4. Main flows

### deposit (user PTB — YIELD leg)
1. user sends `Coin<DUSDC>`
2. `predict::supply<DUSDC>` → `Coin<PLP>` joined into `vault.plp` (yield leg, trustless)
3. `shares = mul_div(assets, total_supply, nav)`, `share::mint` → `Coin<SHARE>` to user
4. `nav += assets`; emit `Deposited`

> Constraint note (verified from source): `predict::mint` is **owner-gated** (`sender == manager.owner()`) & **takes no Coin** (funds flow through `PredictManager`). The Vault object cannot be the `sender`, so the **hedge is NOT minted during the user deposit**. The hedge is added during **roll** by the operator (see below).

### roll (keeper, every expiry)
1. expiry settles → `predict::redeem` the already-settled positions (PLP & binary)
2. compute new NAV, snapshot
3. determine the new hedge strike from `OracleSVI` (e.g. 1σ)
4. re-`supply` + re-`mint` for the next expiry
5. emit `Rolled`

### withdraw
- burn `Coin<SHARE>`, return dUSDC pro-rata (unwind part of the PLP/hedge if idle is insufficient). Withdrawal queue for large amounts.

## 5. DeepBook Predict integration (contract points)

| Call | Purpose | Note |
|---|---|---|
| `predict::supply` | mint PLP (yield leg) | quote = dUSDC (not testnet USDC) |
| `predict::mint` | buy OTM binary (hedge leg) | key: (oracle_id, expiry, strike, is_up) |
| `predict::redeem` / `redeem_permissionless` | settle + auto-roll | keeper uses the permissionless version |
| `OracleSVI` getter + `OracleSVIUpdated` | strike & valuation | sub-hour rolling expiry |
| `predict-server.testnet.mystenlabs.com` | UI/keeper index | don't raw-scan the chain |

> ✅ Exact signatures already pulled from branch **`predict-testnet-4-16`** (package `deepbook_predict` @ `packages/predict`, quote `dusdc::dusdc::DUSDC` 6 decimals, PLP `deepbook_predict::plp::PLP`, `market_key::new/up/down`, manager via `predict::create_manager` → shared, `owner = sender`). Testnet deploy IDs provisional → confirm before publishing.

## 5b. Custody model & trust boundary (IMPORTANT)

`predict::mint`/`redeem`/`predict_manager::withdraw` are **owner-gated by `ctx.sender()`** — there is no `&Cap` path. Implications:

- **YIELD leg (PLP):** `supply`/`withdraw` are coin-based & not owner-gated → **fully inside the Vault, trustless**. User principal is safe in the Vault object.
- **HEDGE leg (binary):** must be executed by the **operator address** that owns the `PredictManager`. The Vault funds the manager (`predict_manager::deposit`, public) only up to the **hedge budget** (`hedge_ratio_bps` of NAV). The operator is **semi-trusted** only up to that hedge budget — **not** the principal.
- Mitigation & roadmap: small hedge budget (e.g. 25% of yield), audit log via events, and a fully trustless path pending Predict adding a cap-gated API (noted as future work in the pitch — DeepBook judges are aware of this limitation).

## 6. Sui primitives used
Shared object + capability pattern · atomic PTB (deposit combines supply+mint+share) · `sui::coin` + OTW (composable share) · dynamic fields (hedge per-expiry) · `sui::event` · `Clock 0x6` · OZ `mul_div`/`checked_*`. Optional cross-track: **Walrus** stores the backtest/risk report as a verified blob.

## 7. Credibility proof (mandatory track)
`sim/` runs a Monte-Carlo BTC path → compares the PnL distribution of **raw PLP vs Jaga**: shows the **tail drawdown drops significantly** at a small yield cost. Charts + table output go into the pitch & (optionally) get anchored to Walrus.
```
