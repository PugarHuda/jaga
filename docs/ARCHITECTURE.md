# Jaga — Arsitektur Teknis

## 1. Komponen

```
┌─────────────┐   deposit dUSDC    ┌──────────────────────────────┐
│   User /    │ ─────────────────► │  Vault (shared object, Move) │
│  Dashboard  │ ◄───────────────── │  - Balance<DUSDC> idle       │
└─────────────┘   mint Coin<SHARE> │  - TreasuryCap<SHARE>        │
       ▲                           │  - PredictManager (wrapped)  │
       │ APY/NAV, drawdown         │  - hedge positions (dyn flds)│
       │                           └───────────┬──────────────────┘
┌──────┴───────┐  events / server   PTB atomik │ supply + mint + redeem
│   Keeper     │ ◄───────────────┐             ▼
│ (auto-roll)  │                 │   ┌──────────────────────────┐
└──────┬───────┘                 └───┤   DeepBook Predict        │
       │ predict-server + OracleSVIUpdated │  predict::supply (PLP)  │
       ▼                              │  predict::mint  (binary)  │
   on-chain redeem_permissionless     │  predict::redeem          │
                                      │  OracleSVI (spot/SVI)     │
                                      └──────────────────────────┘
```

## 2. Objek & state on-chain

- **`Vault`** (shared): `idle: Balance<DUSDC>`, `cap: TreasuryCap<SHARE>`, `manager: PredictManager` (atau referensi + TradeProof), `total_shares: u64`, `hedge_ratio_bps: u64`, `strike_policy: u8`, `current_expiry: u64`, dan **dynamic fields** `expiry -> HedgeLot` untuk lacak binary per-siklus.
- **`AdminCap`** (owned): set parameter (hedge ratio, strike policy, pause), buat vault.
- **`KeeperCap`** (owned): hanya boleh memanggil `roll()` (settle + re-deploy). Bisa didelegasikan ke bot tanpa memberi kuasa admin.
- **`SHARE`** = OTW coin (`jaga::share::SHARE`), share token `Coin<SHARE>` (punya `store` → composable).

## 3. NAV & akunting share (ERC4626-style)

```
NAV = value(PLP held)            // dari Predict (redeemable value / mark)
    + value(hedge binaries)      // dari OracleSVI mark, per posisi
    + idle dUSDC

deposit(assets):
    shares = (total_shares == 0)
        ? assets
        : mul_div(assets, total_shares, NAV)   // OZ math, no overflow
    mint Coin<SHARE>(shares)

withdraw(shares):
    assets = mul_div(shares, NAV, total_shares)
    burn shares; return proportional dUSDC (+ unwind pro-rata jika perlu)
```

Valuasi PLP & binary memakai view function Predict / mark dari `OracleSVI`. Bagian yang butuh data off-chain (harga mark presisi) di-feed lewat keeper saat `roll()`; deposit/withdraw intra-epoch memakai NAV terakhir yang ter-snapshot agar aman dari manipulasi.

## 4. Flow utama

### deposit (PTB user — kaki YIELD)
1. user kirim `Coin<DUSDC>`
2. `predict::supply<DUSDC>` → `Coin<PLP>` di-join ke `vault.plp` (kaki yield, trustless)
3. `shares = mul_div(assets, total_supply, nav)`, `share::mint` → `Coin<SHARE>` ke user
4. `nav += assets`; emit `Deposited`

> Catatan kendala (verified dari source): `predict::mint` **owner-gated** (`sender == manager.owner()`) & **tanpa Coin** (dana lewat `PredictManager`). Objek Vault tak bisa jadi `sender`, jadi **hedge TIDAK di-mint saat deposit user**. Hedge ditambahkan saat **roll** oleh operator (lihat di bawah).

### roll (keeper, tiap expiry)
1. expiry settle → `predict::redeem` posisi yang sudah settled (PLP & binary)
2. hitung NAV baru, snapshot
3. tentukan strike hedge baru dari `OracleSVI` (mis. 1σ)
4. re-`supply` + re-`mint` untuk expiry berikutnya
5. emit `Rolled`

### withdraw
- burn `Coin<SHARE>`, kembalikan dUSDC pro-rata (unwind sebagian PLP/hedge bila idle kurang). Withdrawal queue untuk jumlah besar.

## 5. Integrasi DeepBook Predict (titik kontrak)

| Panggilan | Tujuan | Catatan |
|---|---|---|
| `predict::supply` | mint PLP (yield leg) | quote = dUSDC (bukan USDC testnet) |
| `predict::mint` | beli binary OTM (hedge leg) | key: (oracle_id, expiry, strike, is_up) |
| `predict::redeem` / `redeem_permissionless` | settle + auto-roll | keeper pakai versi permissionless |
| `OracleSVI` getter + `OracleSVIUpdated` | strike & valuasi | sub-jam rolling expiry |
| `predict-server.testnet.mystenlabs.com` | indeks UI/keeper | jangan raw-scan chain |

> ✅ Signature persis sudah ditarik dari branch **`predict-testnet-4-16`** (package `deepbook_predict` @ `packages/predict`, quote `dusdc::dusdc::DUSDC` 6 desimal, PLP `deepbook_predict::plp::PLP`, `market_key::new/up/down`, manager via `predict::create_manager` → shared, `owner = sender`). ID deploy testnet provisional → konfirmasi sebelum publish.

## 5b. Model custody & batas kepercayaan (PENTING)

`predict::mint`/`redeem`/`predict_manager::withdraw` **owner-gated oleh `ctx.sender()`** — tidak ada jalur `&Cap`. Implikasi:

- **Kaki YIELD (PLP):** `supply`/`withdraw` berbasis coin & tak owner-gated → **sepenuhnya di dalam Vault, trustless**. Principal user aman di objek Vault.
- **Kaki HEDGE (binary):** harus dieksekusi **operator address** pemilik `PredictManager`. Vault mendanai manager (`predict_manager::deposit`, public) hanya sebesar **budget hedge** (`hedge_ratio_bps` dari NAV). Operator **semi-trusted** sebatas budget hedge itu — **bukan** principal.
- Mitigasi & roadmap: budget hedge kecil (mis. 25% yield), audit log via event, dan jalur trustless penuh menunggu Predict menambah API cap-gated (catat sebagai future work di pitch — juri DeepBook tahu batasan ini).

## 6. Primitif Sui yang dipakai
Shared object + capability pattern · PTB atomik (deposit menggabung supply+mint+share) · `sui::coin` + OTW (share composable) · dynamic fields (hedge per-expiry) · `sui::event` · `Clock 0x6` · OZ `mul_div`/`checked_*`. Opsional cross-track: **Walrus** menyimpan laporan backtest/risk sebagai blob terverifikasi.

## 7. Bukti kredibilitas (wajib track)
`sim/` menjalankan Monte-Carlo BTC path → bandingkan distribusi PnL **PLP mentah vs Jaga**: tunjukkan **drawdown ekor turun signifikan** dengan ongkos yield kecil. Output grafik + tabel masuk ke pitch & (opsional) di-anchor ke Walrus.
```
