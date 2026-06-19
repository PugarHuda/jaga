# Jaga — Deployment (Sui Testnet)

Redeployed 2026-06-18 (hedge-funding fix in `open_hedge`). Operator/deployer: `0xed1e706c3fc3b11337a966a598785fa2da4190368b9a9789d4d99fca9c46d65e`

## Jaga (this project) — current
| Object | ID |
|---|---|
| **Package** | `0x23055600fa07417c0932cb3ec82b5f453ef12c3daadd20d0e55d51698e05c714` |
| **Vault** (shared) | `0xc2689d4a61bd26089cb4149ee1fa41284527bdefebeab233e404358aceeac03a` |
| AdminCap | `0x30451364e66ea42f2baf704d9f408198877071c86170accff64669ee18480b5f` |
| KeeperCap | `0x03fc27417f3ef30ee502b67b505609bac5ebd41cd30ffd7dc0064c4ca3b822f6` |
| TreasuryCap<SHARE> | `0xdc4f0e6517623cd6994e2634ec610199c6083e314189d93e97ba71a65e1bb637` (held by Vault) |
| UpgradeCap | `0x7a0b12f97182738d10216383feb2ede6bc2161df86885429119ffb9ab92998d7` |
| PredictManager (operator-owned, reused) | `0x9c1faf46101cafbfb9e5b996333edc4c512cdb47e2c8bd95365f9707205af855` |
| Predict (shared object, not pkg) | `0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a` |

> Superseded v1 (2026-06-17, pre hedge-funding fix): pkg `0x9bf02925abc532a67ca526ab963d050a00a4d7284d2175fce5bae270a4233f41`, vault `0x88611508ef31e2ad585c5973839d1108bdc49b55a86c6103f5bc6129ef93db35`.

## DeepBook Predict (linked, testnet — already live)
| Package | ID |
|---|---|
| deepbook_predict | `0xf5ea2b3749c65d6e56507cc35388719aadb28f9cab873696a2f8687f5c785138` |
| dusdc | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a` |
| deepbook (orig → upgraded) | `0xfb28c4…6982` → `0x74cd5657843c627f3d80f713b71e9f895bbbeb470956d8a8e1185badf6cc77c8` |
| token | `0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8` |

Explorer: https://suiscan.xyz/testnet/object/0x88611508ef31e2ad585c5973839d1108bdc49b55a86c6103f5bc6129ef93db35

## Build/publish notes
- Branch deps (`deepbook_predict`, `dusdc`, `deepbook`, `token`) ship with `published-at` unset (0x0) on `predict-testnet-4-16`. To link against the LIVE testnet deployment (not republish copies), added `published-at` + real addresses to the cached manifests under `~/.move/git/.../packages/*/Move.toml` (deepbook: address=original id, published-at=upgraded id), then `sui client publish --allow-dirty`.
- `Move.toml` needs `override = true` on `Sui` + `MoveStdlib` (branch pins older framework rev).
- Recreate: `sui client publish --gas-budget 300000000 --allow-dirty` → `predict::create_manager` → `vault::create(<treasuryCap> <managerId> <operator> 2500)`.
