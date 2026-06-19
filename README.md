# Jaga 🛡️

**Hasil yield PLP, dikurangi asuransi crash — dalam satu token.**

Jaga adalah vault otomatis di atas **DeepBook Predict** (protokol prediksi/opsi ber-volatility-surface di Sui). Vault menyetor dUSDC ke pool LP Predict untuk memanen **yield PLP**, dan secara bersamaan membeli **opsi binary OTM** sebagai **asuransi crash** yang membayar justru saat PLP rugi. Hasilnya: yield LP dengan **drawdown ekor yang dibatasi**, dibungkus sebagai **share token composable** yang auto-roll tiap expiry.

> Sui Overflow 2026 — Track: **DeepBook Predict** ($35k 1st prize).

## Kenapa ini perlu ada

Pemilik **PLP pada dasarnya adalah "rumah"** di DeepBook Predict — vault PLP mengambil sisi lawan tiap trade. Saat tenang, PLP makan premi (yield enak). Saat BTC bergerak ekstrem, payout binary trader memukul PLP keras (**left-tail risk**). Inilah yang menahan LP serius masuk: *"Apakah PLP aman?"*

**Jaga menjawabnya:** kamu tetap dapat yield PLP, tapi drawdown saat crash di-cap oleh kaki hedge. Lebih mudah dijual ke LP luar daripada PLP mentah.

## Cara kerja (dua kaki, satu posisi)

| | Kaki 1 — Yield | Kaki 2 — Hedge |
|---|---|---|
| Aksi | `predict::supply` dUSDC → terima **PLP** | `predict::mint` beli **binary OTM** |
| Untung saat | Pasar tenang | Pasar crash |
| Biaya saat | Pasar crash (PLP bayar payout) | Pasar tenang (premi hedge hangus) |

Net = kurva hasil lebih halus, drawdown terbatas. Parameter desain: **hedge ratio** (statis bps / dinamis dari utilisasi & realized vol) dan **kebijakan strike** (mis. 1σ dari SVI surface).

## Kebaruan

Tidak ada produk yang menempati sel ini — di Sui maupun DeFi umum. DOV (Ribbon/Aevo) **menjual** proteksi; hedged-LP (Rage/Umami) hanya hedge delta pakai perps; principal-protected note (Typus SAFU/Cega) basisnya lending + opsi upside. Jaga = **yield LP house-pool + beli binary OTM sebagai crash-hedge + 1 share token composable**, native di DeepBook Predict. Lihat `docs/ARCHITECTURE.md`.

## Struktur repo

```
contracts/   # Move package "jaga": vault, share token, events
keeper/      # Bot auto-roll + monitor settlement + NAV sync (TypeScript)
sim/         # Backtest / Monte-Carlo simulasi (bukti kredibilitas vault)
web/         # Dashboard deposit/withdraw + APY net-of-insurance (Next.js)
docs/        # ARCHITECTURE.md, DEPLOYMENTS.md, PROOF.md, TASKS.md
```

## Live di testnet ✅

Seluruh siklus **deposit → supply PLP → sync NAV → hedge (via redeem PLP) → settle** sudah
berjalan end-to-end di **Sui testnet** melawan kontrak DeepBook Predict asli. Bukti lengkap +
digest transaksi: [`docs/PROOF.md`](docs/PROOF.md).

| Objek | ID |
|---|---|
| Package `jaga` | `0x23055600fa07417c0932cb3ec82b5f453ef12c3daadd20d0e55d51698e05c714` |
| Vault (shared) | `0xc2689d4a61bd26089cb4149ee1fa41284527bdefebeab233e404358aceeac03a` |

Highlight teknis (lihat PROOF):
- **Kaki yield trustless** — `predict::supply` berbasis coin, sepenuhnya di dalam Vault.
- **Kaki hedge** — `predict::mint` itu *owner-gated* & dananya lewat PredictManager internal, jadi
  Vault **menebus PLP → dUSDC → mendanai PredictManager → mint binary OTM-DOWN**. Strike otomatis
  melangkah ke level *mintable* terdalam (Predict memberi lantai harga ask ≈ 1% notional).
- **NAV** dihitung persis seperti rumus `supply`/`withdraw` Predict (`vault_value / PLP_supply`).
- **Keeper restart-safe** — posisi terbuka di-rediscover dari `Table<MarketKey,u64>` PredictManager.

## Jalankan sendiri

```bash
# Kontrak
cd contracts && sui move test --allow-dirty

# Keeper (operator key di keeper/.env)
cd keeper && npm install
npx tsx --env-file=.env src/e2e.ts state              # baca NAV/PLP/share
DRY_RUN=true npx tsx --env-file=.env src/index.ts     # loop keeper (simulasi)

# Dashboard
cd web && npm install && npm run dev                   # http://localhost:3000
```

## Status

Live di testnet (Sui Overflow 2026, track DeepBook Predict). Lihat `docs/TASKS.md` untuk progress.
