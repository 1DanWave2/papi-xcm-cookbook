# Chapter 2 — Teleport PAS from Paseo Relay to Asset Hub

This is the smallest end-to-end XCM example that does something real.
A user holds PAS on the **Paseo relay chain**. They want to move some of
it to **Paseo Asset Hub**, the system parachain where most user-facing
asset activity actually lives.

Between these two chains the transfer is a **teleport**, not a reserve
transfer (see [chapter 1](./01-setup-and-xcm-mental-model.md#two-transfer-flavors-youll-see)).
The relay and the system parachains explicitly trust each other for PAS,
so we use `XcmPallet.limited_teleport_assets` and skip the reserve-account
gymnastics.

By the end of this chapter you will have:

- a Node script that submits a teleport from your Talisman account
- a typed event watcher that tells you when the funds land
- a working pattern you can adapt to any system-chain teleport

## What you need from chapter 1

- Project created with `polkadot-api` + `@polkadot-api/descriptors`
- `paseo` and `paseo_asset_hub` descriptors generated (`pnpm papi add …`)
- Talisman extension with a **Polkadot Relay Chain** account
- ≥ 1 PAS on Paseo relay and ≥ 1 PAS on Paseo Asset Hub
  (request from <https://faucet.polkadot.io/>)

For the runnable examples below, replace `MY_ADDRESS` with the SS58
address from your Talisman account.

## Wiring the clients

We need two clients: one for the relay (the source), one for Asset Hub
(the destination). We open both up-front so we can both submit on the
relay and watch arrivals on AH.

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

Two practical notes:

- **Public RPC nodes throttle.** If you see frequent timeouts during
  development, switch to a different endpoint (Onfinality, Dwellir,
  Parity, etc.) or run a local light client (see appendix at the end of
  the chapter).
- The clients are independent. A failure on one doesn't take the other
  down.

## Plugging in a Talisman signer

PAPI's typed extrinsics are submitted with a `PolkadotSigner`. The
browser-extension shape is provided by the `polkadot-api/pjs-signer`
helper — it wraps any polkadot.js-style extension (Talisman, SubWallet,
the official polkadot.js extension).

```ts
// src/signer.ts
import {
  connectInjectedExtension,
  getInjectedExtensions,
} from "polkadot-api/pjs-signer"

export async function getTalismanSigner(targetAddress: string) {
  const available = getInjectedExtensions()
  if (!available.includes("talisman")) {
    throw new Error(
      "Talisman extension not found. Install it from talisman.xyz.",
    )
  }

  const talisman = await connectInjectedExtension("talisman")
  const accounts = talisman.getAccounts()
  const account = accounts.find((a) => a.address === targetAddress)
  if (!account) {
    throw new Error(
      `Address ${targetAddress} is not in the Talisman accounts list. ` +
        "Open Talisman and confirm the account is enabled for this site.",
    )
  }

  return account.polkadotSigner
}
```

A few things to know about this helper:

- `connectInjectedExtension("talisman")` triggers Talisman's permission
  popup the first time. The user has to click **Allow** in the extension.
- `getAccounts()` returns whatever accounts the user enabled for the
  current dApp — not necessarily every account in the wallet.
- The returned `polkadotSigner` is the only object PAPI extrinsics need.
  It knows how to sign and how to format payloads.

## Building the XCM payload

A teleport from the relay is one extrinsic — `XcmPallet.limited_teleport_assets`.
Three of its arguments are the locations and asset we covered in
chapter 1. The other two control fees and the weight cap.

```ts
// src/teleport.ts
import { AccountId, Enum } from "polkadot-api"
import { toHex } from "polkadot-api/utils"
import {
  XcmV3Junctions,
  XcmV3Junction,
  XcmV3MultiassetAssetId,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
} from "@polkadot-api/descriptors"

import { relayApi } from "./clients"

const ASSET_HUB_PARA_ID = 1000
const encodeAccount = AccountId().enc

/** Destination = parachain 1000 (Asset Hub) viewed from the relay. */
const destination = Enum("V3", {
  parents: 0,
  interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(ASSET_HUB_PARA_ID)),
})

/** Beneficiary = a 32-byte account on the destination chain. */
function beneficiary(address: string) {
  return Enum("V3", {
    parents: 0,
    interior: XcmV3Junctions.X1(
      XcmV3Junction.AccountId32({
        network: undefined,
        id: toHex(encodeAccount(address)),
      }),
    ),
  })
}

/** Native PAS, as seen by the relay (parents = 0, Here means "this chain"). */
function nativeAsset(amount: bigint) {
  return Enum("V3", [
    {
      id: XcmV3MultiassetAssetId.Concrete({
        parents: 0,
        interior: XcmV3Junctions.Here(),
      }),
      fun: XcmV3MultiassetFungibility.Fungible(amount),
    },
  ])
}

export function buildTeleport(beneficiaryAddress: string, amount: bigint) {
  return relayApi.tx.XcmPallet.limited_teleport_assets({
    dest: destination,
    beneficiary: beneficiary(beneficiaryAddress),
    assets: nativeAsset(amount),
    fee_asset_item: 0,
    weight_limit: XcmV3WeightLimit.Unlimited(),
  })
}
```

A few non-obvious points:

- The asset's `parents: 0` because we're describing it from the **relay's**
  point of view — PAS is native to the relay, so it's "here." If you ever
  build the *same* teleport from Asset Hub looking back at the relay,
  PAS becomes `parents: 1, Here` — "one level up, native there."
- `fee_asset_item: 0` says "use the first (and only) asset in the list
  to pay the destination's execution fee." For multi-asset transfers
  you'd point at a different index.
- `weight_limit: Unlimited` is fine for a teleport — the destination's
  PolkadotXcm pallet caps execution anyway. For sends where you don't
  control the destination, use `Limited({ ref_time, proof_size })` so a
  hostile chain can't burn your asset on absurd execution.

## Submitting and watching the transaction

PAPI gives you a single fluent call that signs, submits, and emits an
observable of `TxEvent` values.

```ts
// src/submit.ts
import { TxEvent } from "polkadot-api"

import { buildTeleport } from "./teleport"
import { getTalismanSigner } from "./signer"

const MY_ADDRESS = "15ou8P2L6GkKj8fio4PeNyZUUaeEJfYqtMifsM3MR8pqq8Lv"
const ONE_PAS = 10_000_000_000n // PAS has 10 decimals on Paseo

export async function runTeleport() {
  const signer = await getTalismanSigner(MY_ADDRESS)
  const tx = buildTeleport(MY_ADDRESS, ONE_PAS / 10n) // 0.1 PAS

  await new Promise<void>((resolve, reject) => {
    tx.signSubmitAndWatch(signer).subscribe({
      next: (e: TxEvent) => logEvent(e),
      error: reject,
      complete: resolve,
    })
  })
}

function logEvent(e: TxEvent) {
  switch (e.type) {
    case "signed":
      console.log("✅ Signed:", e.txHash)
      break
    case "broadcasted":
      console.log("📡 Broadcasted to:", e.txHash)
      break
    case "txBestBlocksState":
      if (e.found) {
        console.log(
          `📦 Included in best block ${e.block.hash}#${e.block.index}`,
        )
      }
      break
    case "finalized":
      console.log(
        `🏁 Finalized in ${e.block.hash}#${e.block.index}`,
      )
      break
  }
}
```

The lifecycle is:

1. `signed` — Talisman returned the signed payload.
2. `broadcasted` — the RPC node forwarded the tx to the network.
3. `txBestBlocksState` (with `found: true`) — the tx is in the best
   block, but the chain may still re-org.
4. `finalized` — at least 2/3 of validators have signed off; the tx is
   now final.

`finalized` is the right place to consider the **source side** done.
The funds, however, are *not yet on Asset Hub* at that point — XCM
delivery is a separate step. We watch for it next.

## Watching the asset arrive on Asset Hub

XCM messages cross from the relay into a parachain through the
parachain's downward message queue. On Paseo Asset Hub the
`MessageQueue` pallet emits a `Processed` event when a UMP/HRMP message
is consumed, and the balances pallet emits a `Deposit` event when funds
hit our account. We listen for the latter — it's the user-visible signal.

```ts
// src/watch.ts
import { firstValueFrom } from "rxjs"
import { filter, take, timeout } from "rxjs/operators"

import { ahApi } from "./clients"

export async function waitForDeposit(toAddress: string, minAmount: bigint) {
  return firstValueFrom(
    ahApi.event.Balances.Deposit.watch(({ who, amount }) => {
      return who === toAddress && amount >= minAmount
    }).pipe(
      take(1),
      timeout({ first: 90_000 }),
    ),
  )
}
```

PAPI's `api.event.<Pallet>.<Event>.watch(predicate)` is a typed observable
of decoded events. The predicate runs against the typed payload, so
`who` and `amount` already have the right types — no manual decoding.

If 90 seconds pass without a deposit, the timeout fires. That's usually
a sign that:

- The teleport extrinsic itself reverted on the relay (check the
  finalized block's events).
- The destination chain rejected the message — open Paseo Asset Hub's
  recent blocks on Subscan and look for `MessageQueue.ProcessingFailed`.
- You teleported to the wrong account (typo in the SS58 string).

## Putting it together

```ts
// examples/teleport.ts
import { runTeleport } from "../src/submit"
import { waitForDeposit } from "../src/watch"

const MY_ADDRESS = "15ou8P2L6GkKj8fio4PeNyZUUaeEJfYqtMifsM3MR8pqq8Lv"
const MIN_EXPECTED = 1_000_000_000n // 0.1 PAS minus fees

async function main() {
  console.log("Submitting teleport on Paseo relay…")
  const depositPromise = waitForDeposit(MY_ADDRESS, MIN_EXPECTED)
  await runTeleport()

  console.log("Waiting for deposit on Asset Hub…")
  const deposit = await depositPromise
  console.log("🎉 Arrived:", deposit)
}

main().catch((err) => {
  console.error("❌", err)
  process.exit(1)
})
```

Run it:

```bash
pnpm tsx examples/teleport.ts
```

You should see something like:

```
Submitting teleport on Paseo relay…
✅ Signed: 0x9a3c…
📡 Broadcasted to: 0x9a3c…
📦 Included in best block 0xbf7e…#3
🏁 Finalized in 0xbf7e…#3
Waiting for deposit on Asset Hub…
🎉 Arrived: { who: '15ou8…', amount: 99502345678n }
```

The arrived amount is slightly less than 0.1 PAS — the difference is the
destination's execution fee, paid in PAS because that's what we sent.

## Reserve transfers — what would change

Suppose we wanted to send PAS from Paseo Asset Hub to a *third-party*
parachain that does not trust the relay's teleport (say, hypothetically,
parachain `2042`). Three pieces of the code change:

- The extrinsic becomes `PolkadotXcm.limited_reserve_transfer_assets`
  (called on Asset Hub, not the relay).
- `dest` becomes `{ parents: 1, X1(Parachain(2042)) }` — go up to the
  relay, then down to parachain `2042`.
- The asset's view changes too: from Asset Hub, native PAS is
  `{ parents: 1, Here }` because PAS lives one hop up at the relay.

The PAPI shape is otherwise identical. The same `XcmV3Junctions`,
`XcmV3Junction`, `XcmV3MultiassetAssetId`, and `XcmV3MultiassetFungibility`
builders apply.

A complete reserve-transfer example will land in chapter 3 alongside
Chopsticks-based debugging, because reserves are also where most XCM
bugs show up in production.

## Appendix — running against a local light client

For development against Paseo it's often nicer to skip public RPC and
use a light client embedded via Smoldot. It removes the throttling
problem and lets you point examples at any chain without finding an
endpoint.

```ts
import { createClient } from "polkadot-api"
import { getSmProvider } from "polkadot-api/sm-provider"
import { chainSpec as paseoSpec } from "polkadot-api/chains/paseo"
import { start } from "polkadot-api/smoldot"

const smoldot = start()
const chain = await smoldot.addChain({ chainSpec: paseoSpec })
const client = createClient(getSmProvider(chain))
```

Trade-off: light clients take 30–60 seconds to sync on first run. They're
great for repeated development but overkill for one-off scripts.

## What's next

Chapter 3 covers the debugging side. We fork Paseo with **Chopsticks**,
replay a teleport against the forked state, and watch what the
destination chain actually does with our XCM message. That same flow is
how you investigate "my message vanished" reports in production — and
it's the single most useful XCM tool nobody mentions when you ask "how
do I learn XCM."
