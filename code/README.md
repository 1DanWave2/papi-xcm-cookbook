# PAPI XCM Cookbook — code

Runnable companion repo to the [PAPI XCM Cookbook](../README.md).

## Setup

```bash
pnpm install

# Generate typed descriptors for Paseo + Paseo Asset Hub
pnpm papi add paseo -n paseo
pnpm papi add pasAh -n paseo_asset_hub
pnpm papi
```

## Examples

```bash
# Chapter 2: live teleport on Paseo testnet (needs Talisman + ≥1 PAS)
pnpm teleport

# Chapter 3: replay against a Chopsticks fork
# First, start Chopsticks in another terminal:
#   pnpm chopsticks xcm --relaychain=paseo --parachain=paseo-asset-hub
pnpm replay
```

## Layout

```
src/
  clients.ts         # Paseo relay + Asset Hub clients
  fork-clients.ts    # Same, against a local Chopsticks fork
  signer.ts          # Talisman browser-extension signer
  submit.ts          # Sign + submit a teleport, log events
  teleport.ts        # Build the XCM payload
  watch.ts           # Wait for Balances.Deposit on the destination

examples/
  teleport.ts        # End-to-end Paseo run (chapter 2)
  replay-teleport.ts # Chopsticks replay (chapter 3)

chopsticks.yml       # Fork config for chapter 3
```

## License

MIT.
