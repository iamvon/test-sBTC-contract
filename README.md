# test-sBTC contract

Dev-only Stacks Testnet token that mimics the basic shape of sBTC as a fungible token, but is not the canonical sBTC bridge asset.

## Files

- `contracts/test-sbtc-faucet.clar`: token + faucet contract
- `settings/Testnet.example.toml`: safe testnet config template
- `settings/Devnet.example.toml`: safe devnet config template

## What it does

- Exposes SIP-010-style token methods: `transfer`, `get-name`, `get-symbol`, `get-decimals`, `get-balance`, `get-total-supply`, `get-token-uri`
- Lets anyone call `faucet-mint` while the faucet is enabled
- Lets the deployer call `owner-mint`, `owner-burn`, `set-faucet-enabled`, `set-faucet-max-amount`, and `set-token-uri`

## Deploy

1. Install Clarinet.
2. Copy `settings/Testnet.example.toml` to `settings/Testnet.toml`.
3. Replace the mnemonic in `settings/Testnet.toml` with your Stacks Testnet deployer mnemonic.
4. From this repo, run:

```bash
clarinet deployments generate --testnet
clarinet deployments apply --testnet
```

## Mint from CLI after deploy

Example with Clarinet console-style contract call through a wallet/tooling flow:

- Call `faucet-mint`
- Params:
  - `amount`: integer in 8 decimals
  - `recipient`: recipient principal

Example amount reference:

- `u100000000` = 1.00000000 tsBTC
- `u1000000` = 0.01000000 tsBTC

## Simple Node CLI

This repo also includes a small script for broadcasting `faucet-mint` and `owner-mint` calls to Stacks.

Install dependencies:

```bash
npm install
```

Use a mnemonic:

```bash
npm run token-cli -- \
  --action faucet \
  --recipient ST2... \
  --ui-amount 1 \
  --contract-address ST2... \
  --contract-name test-sbtc-faucet \
  --mnemonic "your 24 word seed phrase" \
  --network testnet
```

Use a private key:

```bash
npm run token-cli -- \
  --action owner-mint \
  --recipient ST2... \
  --amount 100000000 \
  --contract-address ST2... \
  --contract-name test-sbtc-faucet \
  --private-key your_private_key_hex \
  --network testnet
```

Notes:

- `faucet` maps to the contract function `faucet-mint`
- `owner-mint` maps to the contract function `owner-mint`
- use `--amount` for raw base units or `--ui-amount` for a decimal token amount
- `100000000` raw = `1.00000000 tsBTC`
- `--ui-amount` supports up to 8 decimal places
- faucet calls now do a read-only preflight and fail locally if the faucet is disabled or the amount exceeds the on-chain faucet max
- `owner-mint` only works from the deployer / owner account

## Upgradeability

You cannot mutate already-deployed Clarity code in place.

If you need new logic, deploy a new contract name or version, for example:

- `test-sbtc-faucet-v2`
- `test-sbtc-faucet-v3`

You can keep some settings mutable through data vars, which this contract already does for:

- faucet enabled flag
- faucet max amount
- token URI

If you want a stronger upgrade path, use a separate registry/proxy pattern and point apps at the registry rather than a fixed token contract.
