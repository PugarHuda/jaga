# Jaga — Submission Pack (Sui Overflow 2026 · DeepBook Predict)

Checklist deadline: **21 Juni 2026, 6:00 PM PT**. Submit di DeepSurge. Repo public, video ≤5 menit
(YouTube), tim ≥2, ≥1 KYC, profil mahasiswa untuk University Award.

---

## 1. One-liner / tagline
> **Jaga — PLP yield minus crash insurance, in one composable token.**
> An automated vault on DeepBook Predict that earns PLP yield and buys OTM binary "puts" as a
> crash hedge, capping left-tail drawdown. Live on testnet.

## 2. Deskripsi (DeepSurge — ~150 kata)
DeepBook Predict's PLP holders are effectively "the house": they earn premium when markets are calm
but absorb brutal payouts when BTC moves violently — a fat left tail that scares serious LPs away.

Jaga fixes the risk shape. It's an automated vault that (1) supplies dUSDC to Predict's PLP pool to
earn yield, and (2) each roll spends a small premium buying out-of-the-money binary DOWN options on
Predict as crash insurance. When markets are calm you collect PLP yield minus a thin premium; when
BTC crashes, the hedge pays off exactly when PLP bleeds. Depositors hold one composable `Coin<SHARE>`
(jSHARE) representing the hedged position; a keeper auto-rolls the hedge every expiry.

The whole lifecycle runs end-to-end on Sui testnet against the real Predict contracts. A 30,000-path
Monte-Carlo backtest shows ~16-point better CVaR-1% for ~1% of yield given up.

## 3. Why Sui / DeepBook Predict specifically
- The hedge instrument **only exists on Predict** — native binary options on a live SVI vol surface.
- `Coin<SHARE>` uses Sui's object model so the vault position is **composable** (collateral, LP) —
  not a balance trapped in a contract.
- The Vault is a **shared object**; the trustless yield leg lives fully on-chain, while the
  owner-gated `mint` is delegated to an operator with capability-scoped trust (hedge budget only).

## 4. Novelty (one sentence)
No product occupies this cell — DOVs *sell* options, hedged-LP vaults hedge delta with perps,
principal-protected notes are lending+upside. Jaga is **house-pool LP yield + buying OTM binaries as
crash insurance + one composable share token**, native to DeepBook Predict.

---

## 5. Demo video script (≤5:00)

**0:00–0:30 — Hook / problem.**
"On DeepBook Predict, PLP holders are the house. Great yield when it's calm — but when BTC gaps down,
they eat the payouts. That left-tail risk is why big LPs stay out." Show the PLP CVaR-1% ≈ −54% bar.

**0:30–1:10 — The idea.**
"Jaga keeps the PLP yield but buys cheap out-of-the-money crash insurance on the same protocol.
Two legs, one token." Show the two-leg table (yield vs hedge) and the jSHARE token.

**1:10–2:10 — The simulation (credibility).**
Walk the dashboard distribution chart: raw PLP vs Jaga over 30k Monte-Carlo BTC paths. "Same upside,
but the crash tail is cut — CVaR-1% improves ~16 points for about 1% of yield given up." Point at the
two CVaR reference lines.

**2:10–3:40 — Live on testnet (the proof).**
Terminal: `e2e.ts deposit 50` → show 50 jSHARE minted, dUSDC supplied to PLP. Then run the keeper
(`DRY_RUN=false`): show `sync_nav: success`, then `open_hedge: success` — "the vault just redeemed a
slice of PLP and minted an OTM-DOWN binary as insurance, fully on-chain." Open the tx on suiscan.
Mention: strike auto-steps to the deepest *mintable* level; keeper rediscovers positions on restart.

**3:40–4:30 — The product / UX.**
Web dashboard: connect wallet, NAV, price-per-share, hedge ratio, deposit/withdraw. "One click in,
one composable token out. A keeper handles the rolling. An LP never has to think about options."

**4:30–5:00 — Vision / roadmap.**
"Mainnet-ready architecture. Next: dynamic hedge ratio from realized vol + SVI, multi-asset, and
jSHARE as collateral across Sui DeFi. Jaga makes being the house survivable." Logo + repo URL.

**Recording tips:** 1080p, captions on terminal steps, pre-fund the wallet, pre-open suiscan tabs,
keep keeper logs filtered to the key lines. Record the deposit live; the heavier hedge roll can be
pre-run with the tx ready to open on suiscan if timing is tight.

---

## 6. Logo / branding
- Symbol: shield 🛡️ ("jaga" = *to guard* in Indonesian). Square 1:1, dark bg `#0d1117`, accent
  blue `#2f81f7` (matches dashboard). Wordmark "Jaga" + tagline below.
- Quick path: a flat shield glyph with a small downward candlestick "caught" inside it.

## 7. Submission fields checklist (DeepSurge)
- [ ] Project name: **Jaga**
- [ ] Track: **DeepBook Predict**
- [ ] Tagline (§1), Description (§2)
- [ ] Repo URL (public) + Package ID `0x2305…c714`
- [ ] Demo video (YouTube, ≤5 min)
- [ ] Testnet proof link → `docs/PROOF.md`
- [ ] Team ≥2 registered; ≥1 KYC; student profiles for University Award
- [x] Logo 1:1 → `web/public/logo.svg` (export to PNG if the form needs raster)

## 8. Pre-submit smoke test
```
cd contracts && sui move test --allow-dirty          # 1 passed
cd keeper && npx tsc --noEmit                         # green
cd keeper && npx tsx --env-file=.env src/e2e.ts state # NAV reads
cd web && npm run build                               # compiles
```
