/// Event Jaga — di-emit untuk dikonsumsi keeper & dashboard.
module jaga::events;

use sui::event;

public struct Deposited has copy, drop {
    vault: ID,
    user: address,
    assets: u64,   // dUSDC masuk
    shares: u64,   // jSHARE di-mint
    nav: u64,      // NAV saat deposit
}

public struct Withdrawn has copy, drop {
    vault: ID,
    user: address,
    shares: u64,
    assets: u64,
    nav: u64,
}

public struct Rolled has copy, drop {
    vault: ID,
    expiry: u64,          // expiry yang baru di-deploy
    plp_supplied: u64,    // dUSDC ke kaki yield
    hedge_minted: u64,    // dUSDC ke kaki hedge
    strike: u64,          // strike binary OTM terpilih
    nav: u64,             // NAV setelah roll
}

public struct ParamUpdated has copy, drop {
    vault: ID,
    hedge_ratio_bps: u64,
    strike_policy: u8,
}

public(package) fun deposited(vault: ID, user: address, assets: u64, shares: u64, nav: u64) {
    event::emit(Deposited { vault, user, assets, shares, nav })
}

public(package) fun withdrawn(vault: ID, user: address, shares: u64, assets: u64, nav: u64) {
    event::emit(Withdrawn { vault, user, shares, assets, nav })
}

public(package) fun rolled(vault: ID, expiry: u64, plp_supplied: u64, hedge_minted: u64, strike: u64, nav: u64) {
    event::emit(Rolled { vault, expiry, plp_supplied, hedge_minted, strike, nav })
}

public(package) fun param_updated(vault: ID, hedge_ratio_bps: u64, strike_policy: u8) {
    event::emit(ParamUpdated { vault, hedge_ratio_bps, strike_policy })
}
