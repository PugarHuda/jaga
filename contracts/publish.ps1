# Publish Jaga ke Sui testnet. Jalankan dari folder contracts/.
# Prasyarat: sui CLI terpasang, env aktif = testnet, alamat aktif ada gas (sui client faucet).
$ErrorActionPreference = "Stop"
Write-Host "== sui env ==" ; sui client active-env ; sui client active-address
Write-Host "== build ==" ; sui move build
Write-Host "== test ==" ; sui move test
Write-Host "== publish ==" ; sui client publish --gas-budget 200000000
Write-Host "Catat PackageID dari output, lalu set di keeper/.env & web/.env.local"
