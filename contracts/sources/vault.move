/// Jaga — hedged-PLP vault di atas DeepBook Predict.
///
/// Dua kaki:
///   1. YIELD  (trustless on-chain): `predict::supply` dUSDC -> `Balance<PLP>` disimpan vault.
///      `predict::withdraw` PLP -> dUSDC untuk melayani penarikan. Berbasis coin, tidak owner-gated.
///   2. HEDGE  (operator-executed di roll): `predict::mint` binary OTM. Owner-gated
///      (`sender == manager.owner()`) & dananya lewat PredictManager internal, jadi objek Vault
///      tak bisa memintanya sendiri. Operator (pemilik PredictManager) menjalankannya saat roll.
///      Trust di-operator dibatasi hanya ke budget hedge (mis. hedge_ratio_bps dari NAV).
///
/// Akunting share = ERC4626-snapshot: NAV & plp_px di-update keeper saat `sync_nav` (sub-jam),
/// deposit/withdraw intra-epoch memakai snapshot terakhir.
module jaga::vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::clock::Clock;

use jaga::share::{Self, SHARE};
use jaga::events;

use deepbook_predict::predict::{Self, Predict};
use deepbook_predict::predict_manager::{Self, PredictManager};
use deepbook_predict::oracle::{Self as pred_oracle, OracleSVI};
use deepbook_predict::plp::PLP;
use deepbook_predict::market_key;

use dusdc::dusdc::DUSDC;

// === Errors ===
const EPaused: u64 = 1;
const EZeroAmount: u64 = 2;
const EZeroDenom: u64 = 3;
const EBadKeeper: u64 = 4;
const EBadManager: u64 = 5;
const EBadOperator: u64 = 6;

// === Constants ===
const PLP_SCALE: u64 = 1_000_000_000; // skala harga PLP (dUSDC per 1e9 PLP)
const BPS: u64 = 10_000;

// === Objects ===

/// Vault utama (shared). `key` saja (tanpa `store`) -> aturan transfer kustom.
public struct Vault has key {
    id: UID,
    cap: TreasuryCap<SHARE>,     // mint/burn share token
    plp: Balance<PLP>,           // kaki yield (trustless)
    idle: Balance<DUSDC>,        // buffer penarikan + sumber budget hedge
    manager_id: ID,              // PredictManager (operator-owned) untuk kaki hedge
    operator: address,           // pemilik PredictManager; eksekutor mint/redeem hedge
    nav: u64,                    // NAV dUSDC (6 desimal) — snapshot
    plp_px: u64,                 // dUSDC per PLP_SCALE PLP — snapshot
    hedge_ratio_bps: u64,        // porsi NAV untuk budget hedge tiap roll
    strike_policy: u8,           // 0 = fixed bps, 1 = 1σ dari SVI (diputuskan keeper)
    paused: bool,
}

/// Kapabilitas admin: set parameter, pause.
public struct AdminCap has key, store { id: UID }

/// Kapabilitas keeper: hanya boleh roll/sync. Bisa didelegasikan ke bot tanpa kuasa admin.
public struct KeeperCap has key, store { id: UID, vault: ID }

// === Lifecycle ===

/// Buat vault. `cap` = TreasuryCap<SHARE> dari `jaga::share` init.
/// `manager_id` = id PredictManager yang dibuat via `predict::create_manager` oleh `operator`.
#[allow(lint(self_transfer))]
public fun create(
    cap: TreasuryCap<SHARE>,
    manager_id: ID,
    operator: address,
    hedge_ratio_bps: u64,
    ctx: &mut TxContext,
) {
    let vault = Vault {
        id: object::new(ctx),
        cap,
        plp: balance::zero(),
        idle: balance::zero(),
        manager_id,
        operator,
        nav: 0,
        plp_px: PLP_SCALE, // 1:1 awal, di-update keeper
        hedge_ratio_bps,
        strike_policy: 0,
        paused: false,
    };
    let vid = object::id(&vault);
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    transfer::transfer(KeeperCap { id: object::new(ctx), vault: vid }, ctx.sender());
    transfer::share_object(vault);
}

// === User: deposit / withdraw (kaki PLP, trustless) ===

/// Setor dUSDC -> supply ke PLP -> mint Coin<SHARE>. Hedge ditambahkan keeper saat roll.
public fun deposit(
    vault: &mut Vault,
    predict: &mut Predict,
    payment: Coin<DUSDC>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<SHARE> {
    assert!(!vault.paused, EPaused);
    let assets = coin::value(&payment);
    assert!(assets > 0, EZeroAmount);

    let supply = coin::total_supply(&vault.cap);
    let shares = if (supply == 0 || vault.nav == 0) { assets }
                 else { mul_div(assets, supply, vault.nav) };

    // Kaki yield: dUSDC -> PLP, simpan di vault.
    let plp_coin = predict::supply<DUSDC>(predict, payment, clock, ctx);
    balance::join(&mut vault.plp, coin::into_balance(plp_coin));

    vault.nav = vault.nav + assets;
    let share_coin = share::mint(&mut vault.cap, shares, ctx);
    events::deposited(object::id(vault), ctx.sender(), assets, shares, vault.nav);
    share_coin
}

/// Tarik: burn Coin<SHARE> -> dUSDC pro-rata (idle dulu, sisanya redeem PLP).
public fun withdraw(
    vault: &mut Vault,
    predict: &mut Predict,
    shares_coin: Coin<SHARE>,
    clock: &Clock,
    ctx: &mut TxContext,
): Coin<DUSDC> {
    let shares = coin::value(&shares_coin);
    assert!(shares > 0, EZeroAmount);

    let supply = coin::total_supply(&vault.cap);
    assert!(supply > 0, EZeroDenom);
    let assets = mul_div(shares, vault.nav, supply);

    share::burn(&mut vault.cap, shares_coin);
    vault.nav = vault.nav - assets;

    let idle_val = balance::value(&vault.idle);
    let out = if (idle_val >= assets) {
        coin::from_balance(balance::split(&mut vault.idle, assets), ctx)
    } else {
        // Redeem PLP untuk kekurangannya (perkiraan via plp_px snapshot).
        let need = assets - idle_val;
        let plp_amt = mul_div(need, PLP_SCALE, vault.plp_px);
        let plp_coin = coin::from_balance(balance::split(&mut vault.plp, plp_amt), ctx);
        let mut got = predict::withdraw<DUSDC>(predict, plp_coin, clock, ctx);
        if (idle_val > 0) {
            let rest = coin::from_balance(balance::withdraw_all(&mut vault.idle), ctx);
            coin::join(&mut got, rest);
        };
        got
    };
    events::withdrawn(object::id(vault), ctx.sender(), shares, assets, vault.nav);
    out
}

// === Keeper: roll (kaki hedge + sinkronisasi NAV). Ditandatangani operator. ===

/// Update snapshot NAV & harga PLP (dihitung keeper dari Predict/predict-server).
public fun sync_nav(vault: &mut Vault, cap: &KeeperCap, new_nav: u64, new_plp_px: u64) {
    assert_keeper(vault, cap);
    assert!(new_plp_px > 0, EZeroDenom);
    vault.nav = new_nav;
    vault.plp_px = new_plp_px;
}

/// Buka hedge binary OTM untuk expiry berjalan. `strike`/`is_up`/`qty` dihitung keeper
/// (mis. strike 1σ dari SVI, qty disetel agar cost ≈ budget). Sender harus = operator.
public fun open_hedge(
    vault: &mut Vault,
    predict: &mut Predict,
    manager: &mut PredictManager,
    oracle: &OracleSVI,
    cap: &KeeperCap,
    strike: u64,
    is_up: bool,
    qty: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_keeper(vault, cap);
    assert!(object::id(manager) == vault.manager_id, EBadManager);
    assert!(predict_manager::owner(manager) == vault.operator, EBadOperator);

    // Danai PredictManager dgn budget hedge: pakai idle dulu, sisanya REDEEM PLP -> dUSDC.
    // (deposit men-supply 100% ke PLP, jadi idle biasanya 0; premi hedge ditarik dari posisi PLP.)
    let budget = mul_div(vault.nav, vault.hedge_ratio_bps, BPS);
    let avail = balance::value(&vault.idle);
    let from_idle = if (budget <= avail) { budget } else { avail };
    let mut funds = balance::split(&mut vault.idle, from_idle);
    let need = budget - from_idle;
    if (need > 0 && vault.plp_px > 0) {
        let plp_amt = mul_div(need, PLP_SCALE, vault.plp_px);
        let plp_avail = balance::value(&vault.plp);
        let plp_take = if (plp_amt <= plp_avail) { plp_amt } else { plp_avail };
        if (plp_take > 0) {
            let plp_coin = coin::from_balance(balance::split(&mut vault.plp, plp_take), ctx);
            let got = predict::withdraw<DUSDC>(predict, plp_coin, clock, ctx);
            balance::join(&mut funds, coin::into_balance(got));
        };
    };
    let topup = balance::value(&funds);
    if (topup > 0) {
        predict_manager::deposit<DUSDC>(manager, coin::from_balance(funds, ctx), ctx);
    } else {
        balance::destroy_zero(funds);
    };

    let key = market_key::new(object::id(oracle), pred_oracle::expiry(oracle), strike, is_up);
    predict::mint<DUSDC>(predict, manager, oracle, key, qty, clock, ctx);

    events::rolled(object::id(vault), pred_oracle::expiry(oracle), 0, topup, strike, vault.nav);
}

/// Settle hedge yang sudah jatuh tempo: redeem payout ke manager, lalu sapu balik ke vault idle.
public fun settle_hedge(
    vault: &mut Vault,
    predict: &mut Predict,
    manager: &mut PredictManager,
    settled_oracle: &OracleSVI,
    cap: &KeeperCap,
    strike: u64,
    is_up: bool,
    qty: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert_keeper(vault, cap);
    assert!(object::id(manager) == vault.manager_id, EBadManager);
    assert!(predict_manager::owner(manager) == vault.operator, EBadOperator);

    let key = market_key::new(object::id(settled_oracle), pred_oracle::expiry(settled_oracle), strike, is_up);
    predict::redeem_permissionless<DUSDC>(predict, manager, settled_oracle, key, qty, clock, ctx);

    // Sapu payout dUSDC dari manager balance kembali ke vault.
    let bal = predict_manager::balance<DUSDC>(manager);
    if (bal > 0) {
        let c = predict_manager::withdraw<DUSDC>(manager, bal, ctx);
        balance::join(&mut vault.idle, coin::into_balance(c));
    };
}

// === Admin ===

public fun set_params(vault: &mut Vault, _admin: &AdminCap, hedge_ratio_bps: u64, strike_policy: u8) {
    vault.hedge_ratio_bps = hedge_ratio_bps;
    vault.strike_policy = strike_policy;
    events::param_updated(object::id(vault), hedge_ratio_bps, strike_policy);
}

public fun set_paused(vault: &mut Vault, _admin: &AdminCap, paused: bool) {
    vault.paused = paused;
}

// === Views ===

public fun nav(vault: &Vault): u64 { vault.nav }
public fun plp_px(vault: &Vault): u64 { vault.plp_px }
public fun total_shares(vault: &Vault): u64 { coin::total_supply(&vault.cap) }
public fun hedge_ratio_bps(vault: &Vault): u64 { vault.hedge_ratio_bps }
public fun idle_balance(vault: &Vault): u64 { balance::value(&vault.idle) }
public fun plp_balance(vault: &Vault): u64 { balance::value(&vault.plp) }

/// NAV per share (skala 1e6), berguna untuk dashboard APY.
public fun nav_per_share(vault: &Vault): u64 {
    let s = coin::total_supply(&vault.cap);
    if (s == 0) { 1_000_000 } else { mul_div(vault.nav, 1_000_000, s) }
}

// === Helpers ===

fun assert_keeper(vault: &Vault, cap: &KeeperCap) {
    assert!(cap.vault == object::id(vault), EBadKeeper);
    assert!(!vault.paused, EPaused);
}

/// floor(a*b/c) via u128 — bebas overflow. (Bisa diganti openzeppelin_math::mul_div.)
fun mul_div(a: u64, b: u64, c: u64): u64 {
    assert!(c > 0, EZeroDenom);
    (((a as u128) * (b as u128)) / (c as u128)) as u64
}
