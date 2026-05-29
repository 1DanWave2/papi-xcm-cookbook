# Chapter 1 — Setup PAPI and the XCM v4 mental model

Before we send any cross-chain message we need two things: a working PAPI
client connected to **Paseo testnet**, and a clear mental model of what an
XCM message actually is. Both take maybe twenty minutes.

This chapter has zero "code that talks to the chain" yet — that's chapters 2
and 3. Here we set up the project and explain the language so the code in
later chapters reads naturally.

## What you need before you start

- **Node.js 20+** and **pnpm** (or npm/yarn — examples use pnpm)
- A code editor with TypeScript support
- A Polkadot-compatible browser wallet (**Talisman** recommended). The wallet
  needs an account on **Paseo testnet** — see [Get test tokens](#get-test-tokens)
  below.
- About 0.1 PAS in your account for transaction fees (free from the faucet)

You do **not** need real DOT for any chapter in this cookbook.

## Step 1 — Create the project

```bash
pnpm create vite papi-xcm-cookbook --template vanilla-ts
cd papi-xcm-cookbook
pnpm install
pnpm install polkadot-api @polkadot-api/descriptors
```

`polkadot-api` is the runtime client. `@polkadot-api/descriptors` holds the
generated TypeScript types for every chain you talk to — these are how PAPI
gives you autocomplete on every extrinsic, storage item, and constant the
runtime defines.

## Step 2 — Generate Paseo descriptors

PAPI fetches a chain's metadata once, types it, and stores the result in your
project. From then on, every call is fully typed.

```bash
# Add Paseo to your descriptors
pnpm papi add paseo -n paseo
# Add Paseo Asset Hub (where DOT-equivalent tokens live on Paseo)
pnpm papi add pasAh -n paseo_asset_hub
pnpm papi
```

After this finishes you'll have a `.papi/` directory and you can import
typed APIs:

```ts
import { paseo, pasAh } from "@polkadot-api/descriptors"
```

## Step 3 — Connect to a node

For local development the easiest path is a JSON-RPC websocket. Public RPC
endpoints for Paseo:

```ts
// src/clients.ts
import { createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"
import { paseo, pasAh } from "@polkadot-api/descriptors"

const PASEO_RPC = "wss://paseo-rpc.dwellir.com"
const PASEO_AH_RPC = "wss://paseo-asset-hub-rpc.dwellir.com"

export const relayClient = createClient(getWsProvider(PASEO_RPC))
export const ahClient = createClient(getWsProvider(PASEO_AH_RPC))

export const relayApi = relayClient.getTypedApi(paseo)
export const ahApi = ahClient.getTypedApi(pasAh)
```

A few notes on this pattern:

- `createClient(...)` opens the connection but does no work until you ask for
  something. Open clients up-front, they're cheap.
- `getTypedApi(descriptor)` gives you a fully typed handle. `relayApi.tx.…`
  for extrinsics, `relayApi.query.…` for storage, `relayApi.constants.…` for
  constants.
- In a long-running process you should `client.destroy()` on shutdown,
  otherwise the websocket lingers.

## Step 4 — Get test tokens

Paseo's native token is **PAS**. You can grab some from the official faucet
in a few seconds:

- Faucet: <https://faucet.polkadot.io/?parachain=1000> (Asset Hub) or
  <https://faucet.polkadot.io/> (relay)
- Paste your SS58 address, pick **Paseo** + **Asset Hub**, request

0.1 PAS is enough for several dozen extrinsics. If you need more, the
faucet allows re-requesting every few hours.

## The XCM mental model in five sentences

XCM is just a list of typed instructions, addressed to a destination chain,
asking that chain to do something on behalf of an asset. Every message has
**three** decisions baked into it:

1. **Where is the message going?** → a `MultiLocation` describing the
   destination.
2. **Who or what receives the result?** → a `MultiLocation` describing the
   beneficiary.
3. **What asset moves with it?** → a `MultiAsset` describing the funds.

If you can build those three things, you can build an XCM extrinsic. PAPI
gives you typed constructors for each of them.

### MultiLocation, in plain English

A `MultiLocation` is a **path**. It says, starting from one chain's
perspective, how many hops up the hierarchy (the `parents` field) and then
how to walk back down (the `interior` field) to reach the target thing —
which might be another chain, an account, an asset, a pallet, you name it.

| Goal | parents | interior |
|------|---------|----------|
| "This chain itself" | 0 | `Here` |
| "The relay chain, from a parachain" | 1 | `Here` |
| "Parachain 1000, from the relay" | 0 | `X1(Parachain(1000))` |
| "Account `5Foo…` on this chain" | 0 | `X1(AccountId32(...))` |
| "Account `5Foo…` on parachain 1000, from the relay" | 0 | `X2(Parachain(1000), AccountId32(...))` |

`X1`, `X2`, `X3`… are just "the interior has 1/2/3 segments", and each
segment is a `Junction`.

### What PAPI gives you for XCM

All the XCM types live in `@polkadot-api/descriptors`:

```ts
import {
  XcmV3Junctions,
  XcmV3Junction,
  XcmV3MultiassetAssetId,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
} from "@polkadot-api/descriptors"
import { Enum } from "polkadot-api"
```

The pieces you'll actually use, decoded:

| Builder | What it builds | Used for |
|---------|----------------|----------|
| `XcmV3Junctions.Here()` | The empty path | "this location, nothing further" |
| `XcmV3Junctions.X1(j)` | One-segment path | "go to this one place" |
| `XcmV3Junction.Parachain(id)` | A parachain segment | route to a specific chain |
| `XcmV3Junction.AccountId32({...})` | An account segment | route to a specific user |
| `XcmV3MultiassetAssetId.Concrete({...})` | Asset identity | "this is which token" |
| `XcmV3MultiassetFungibility.Fungible(amount)` | Amount | "how much of it" |
| `XcmV3WeightLimit.Unlimited()` / `Limited(...)` | Weight cap | gas budget for the destination |

And the `Enum("V3", value)` wrapper says "this is the V3 form of an XCM
versioned type" — different versions co-exist on the wire so the version
needs to be explicit.

### Two transfer flavors you'll see

XCM has two ways to move a token across chains:

- **Teleport** — only valid when both chains explicitly trust each other for
  that asset. The asset is burned on the source and minted on the
  destination. No reserve account in between. DOT teleports between the
  relay and the system parachains (Asset Hub, Bridge Hub) work this way.

- **Reserve transfer** — used when chains don't trust each other directly.
  The source chain locks the asset in a reserve account, the destination
  mints a derivative ("the IOU"). Every general parachain talks to every
  other parachain through a reserve (usually Asset Hub).

Most cross-chain DOT movement between system chains is a *teleport*. Most
cross-chain DOT movement to a third-party parachain is a *reserve
transfer*. Chapter 2 walks the reserve transfer path end to end.

### The extrinsic surface

On the relay you'll mostly use the `XcmPallet`. On parachains it's usually
called `PolkadotXcm`. They expose the same shape:

| Extrinsic | When to use it |
|-----------|----------------|
| `limited_teleport_assets` | known-trusted teleport (DOT to/from system chains) |
| `limited_reserve_transfer_assets` | reserve-style transfer to another chain |
| `execute` | run an arbitrary XCM message locally |
| `send` | send an arbitrary XCM message to another chain |

The "limited" variants take an explicit `weight_limit` so the destination
chain can refuse if your message is too heavy. Always prefer them in user-
facing code.

## What's next

Chapter 2 puts all of this to work: we'll do a reserve transfer of PAS from
Paseo Asset Hub to a destination parachain, watch the transaction land, and
see the asset arrive on the other side. You'll have a working script you
can re-run as you change the destination.

If anything in this chapter felt fast, two references are worth bookmarking
for later:

- The XCM Format spec: <https://github.com/paritytech/xcm-format>
- The PAPI docs: <https://papi.how>
