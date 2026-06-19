/// Jaga vault share token (jSHARE).
///
/// `SHARE` adalah one-time witness (OTW) sekaligus tipe coin untuk share vault.
/// Dibuat sebagai `Coin<SHARE>` (punya ability `store`) supaya posisi vault
/// portable & composable di DeFi Sui lain (collateral, LP, dsb).
module jaga::share;

use sui::coin::{Self, TreasuryCap};

/// One-time witness. Nama type = nama module (ALL CAPS) — syarat OTW.
public struct SHARE has drop {}

/// Dijalankan tepat sekali saat publish. Membuat currency, membekukan
/// metadata (tidak akan berubah), dan menyerahkan TreasuryCap ke deployer
/// yang nantinya menyetorkannya ke `Vault` lewat `vault::create`.
#[allow(deprecated_usage)]
fun init(witness: SHARE, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,                                  // decimals — samakan dengan dUSDC
        b"jSHARE",                          // symbol
        b"Jaga Vault Share",                // name
        b"Tokenized share of the Jaga hedged-PLP vault on DeepBook Predict",
        option::none(),                     // icon_url
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

/// Test-only: izinkan test memanggil init dengan OTW palsu.
#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(SHARE {}, ctx)
}

/// Helper dipakai modul `vault` (same package) untuk mint/burn share.
public(package) fun mint(cap: &mut TreasuryCap<SHARE>, amount: u64, ctx: &mut TxContext): sui::coin::Coin<SHARE> {
    coin::mint(cap, amount, ctx)
}

public(package) fun burn(cap: &mut TreasuryCap<SHARE>, c: sui::coin::Coin<SHARE>): u64 {
    coin::burn(cap, c)
}
