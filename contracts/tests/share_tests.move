#[test_only]
module jaga::share_tests;

use sui::test_scenario as ts;
use sui::coin::{Self, TreasuryCap};
use jaga::share::{Self, SHARE};

#[test]
fun mint_then_burn_tracks_supply() {
    let admin = @0xA;
    let mut sc = ts::begin(admin);

    // init membuat currency + transfer TreasuryCap ke deployer
    share::init_for_testing(ts::ctx(&mut sc));
    ts::next_tx(&mut sc, admin);

    let mut cap = ts::take_from_sender<TreasuryCap<SHARE>>(&sc);
    assert!(coin::total_supply(&cap) == 0, 0);

    let c = share::mint(&mut cap, 1_000_000, ts::ctx(&mut sc));
    assert!(coin::value(&c) == 1_000_000, 1);
    assert!(coin::total_supply(&cap) == 1_000_000, 2);

    let burned = share::burn(&mut cap, c);
    assert!(burned == 1_000_000, 3);
    assert!(coin::total_supply(&cap) == 0, 4);

    ts::return_to_sender(&sc, cap);
    ts::end(sc);
}
