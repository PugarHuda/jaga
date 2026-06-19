# Jaga — DeepSurge submission (copy-paste ready)

> Deadline **21 Jun 2026, 6:00 PM PT**. Paste each field below into the matching DeepSurge input.
> Live demo: https://jaga-eta.vercel.app · Repo: https://github.com/PugarHuda/jaga

---

## Project name
```
Jaga
```

## Track
```
DeepBook Predict
```

## Tagline / one-liner
```
Jaga — PLP yield minus crash insurance, in one composable token.
```

## Short description / elevator pitch
```
An automated vault on DeepBook Predict that earns PLP yield and buys OTM binary "puts" as a crash hedge, capping left-tail drawdown. One composable jSHARE token, keeper auto-rolled. Live on Sui testnet.
```

## Full description (~150 words)
```
DeepBook Predict's PLP holders are effectively "the house": they earn premium when markets are calm but absorb brutal payouts when BTC moves violently — a fat left tail that scares serious LPs away.

Jaga fixes the risk shape. It's an automated vault that (1) supplies dUSDC to Predict's PLP pool to earn yield, and (2) each roll spends a small premium buying out-of-the-money binary DOWN options on Predict as crash insurance. When markets are calm you collect PLP yield minus a thin premium; when BTC crashes, the hedge pays off exactly when PLP bleeds. Depositors hold one composable Coin<SHARE> (jSHARE) representing the hedged position; a keeper auto-rolls the hedge every expiry.

The whole lifecycle runs end-to-end on Sui testnet against the real Predict contracts. A 30,000-path Monte-Carlo backtest shows ~16-point better CVaR-1% for ~1% of yield given up.
```

## Why Sui / DeepBook Predict
```
- The hedge instrument only exists on Predict — native binary options on a live SVI vol surface.
- Coin<SHARE> uses Sui's object model so the vault position is composable (usable as collateral / LP), not a balance trapped in a contract.
- The Vault is a shared object: the trustless yield leg lives fully on-chain, while the owner-gated mint is delegated to an operator with capability-scoped trust (hedge budget only, never principal).
```

## Novelty (one sentence)
```
No product occupies this cell — DOVs sell options, hedged-LP vaults hedge delta with perps, principal-protected notes are lending+upside; Jaga is house-pool LP yield + buying OTM binaries as crash insurance + one composable share token, native to DeepBook Predict.
```

## Links
```
Repository (public): https://github.com/PugarHuda/jaga
Live dashboard:      https://jaga-eta.vercel.app
Demo video:          <YOUTUBE URL — paste after recording>
Testnet proof:       https://github.com/PugarHuda/jaga/blob/main/docs/PROOF.md
```

## On-chain (Sui testnet)
```
Network:       Sui testnet
Package (jaga): 0x23055600fa07417c0932cb3ec82b5f453ef12c3daadd20d0e55d51698e05c714
Vault (shared): 0xc2689d4a61bd26089cb4149ee1fa41284527bdefebeab233e404358aceeac03a
```

## Logo
```
File: web/public/logo.png  (1024×1024, 1:1)
Also: web/public/logo.svg (vector), web/public/logo-wordmark.png
```

---

## Manual checklist before hitting submit
- [ ] Demo video recorded + uploaded to YouTube (script: docs/SUBMISSION.md §5) → paste URL above
- [ ] Team ≥2 members registered on DeepSurge
- [ ] ≥1 member KYC verified
- [ ] Student profiles linked (University Award eligibility)
- [ ] Logo uploaded (web/public/logo.png)
- [ ] All fields above pasted; repo + live URL open in incognito to confirm public
- [ ] Submit before 21 Jun 2026, 6:00 PM PT
