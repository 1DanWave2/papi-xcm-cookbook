# Chapter 3 — Debugging XCM with Chopsticks

Eventually you will send an XCM message and watch nothing happen on the
destination. No error, no event, no funds — just silence. This is the
single most painful failure mode in cross-chain development, because the
relay says "tx finalized" and you reasonably believe you're done.

This chapter is about the tool that turns that silence into a stack
trace. [Chopsticks](https://github.com/AcalaNetwork/chopsticks) forks a
running chain into a local sandbox, lets you replay an extrinsic against
real on-chain state, and prints every XCM instruction that fires. With
it, "I don't know what went wrong" becomes a 10-minute investigation.

By the end you will have:

- Chopsticks running locally against a fork of Paseo + Paseo Asset Hub
- A replayed teleport that you can step through
- A workflow for reproducing the "delivered but not received" XCM bug
  class

## Why Chopsticks specifically

PAPI gives you typed events. Subscan shows blocks. Polkadot.js Apps shows
storage. None of them, by themselves, can answer "why did my XCM message
do nothing?" Because the answer is usually:

1. The message reached the destination, **then**
2. The destination's XCM Executor processed instruction N, **and**
3. Instruction N failed for a reason the user never sees.

Chopsticks runs the destination's runtime in a local fork. You can feed
it the exact message your relay sent and watch what the executor does
with it — at the granularity of *individual XCM instructions*.

It is also fast (no on-chain submission, no validator delays) and free
(your laptop). Perfect for tight iteration.

## Installing and starting Chopsticks

You need Node.js 20+. Chopsticks runs as a CLI:

```bash
# In a new directory, outside the cookbook examples
pnpm add -D @acala-network/chopsticks
```

Chopsticks reads a small YAML config that tells it which chain to fork
and how to set up XCM connectivity between chains. The minimum config for
us is two chains — Paseo relay and Paseo Asset Hub:

```yaml
# chopsticks.yml
relaychain: &relay
  endpoint: wss://paseo-rpc.dwellir.com
  port: 8000
  db: ./db.sqlite
  mock-signature-host: true

parachains:
  - endpoint: wss://paseo-asset-hub-rpc.dwellir.com
    port: 8001
    db: ./db-ah.sqlite
    mock-signature-host: true
```

Then launch the fork:

```bash
pnpm chopsticks xcm \
  --relaychain=paseo \
  --parachain=paseo-asset-hub
```

The first start downloads metadata and a state snapshot — give it 30–60
seconds. When you see "Running on port 8000" the relay is up; the
parachain mounts on 8001.

`mock-signature-host: true` is the important flag. It lets you submit
transactions signed by **any** account without holding its private key.
You can pretend to be a whale, a council member, or your own address —
the chain accepts the signature.

## Wiring PAPI to talk to the fork

The clients pattern from chapter 2 already supports this — we just point
at the local ports.

```ts
// src/fork-clients.ts
import { createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"
import { paseo, pasAh } from "@polkadot-api/descriptors"

export const forkRelay = createClient(
  getWsProvider("ws://127.0.0.1:8000"),
).getTypedApi(paseo)

export const forkAh = createClient(
  getWsProvider("ws://127.0.0.1:8001"),
).getTypedApi(pasAh)
```

The descriptors are the same as in chapter 2 — Chopsticks runs the real
runtime, so the type generation that matched Paseo also matches its
fork.

## Replaying a teleport against the fork

We can reuse the `buildTeleport` function from chapter 2 verbatim. The
only changes:

1. Submit against `forkRelay` instead of `relayApi`.
2. We don't need Talisman. With `mock-signature-host: true`, Chopsticks
   accepts any signer — we can use a deterministic dev key.

```ts
// examples/replay-teleport.ts
import { Binary, getPolkadotSigner } from "polkadot-api"
import { sr25519CreateDerive } from "@polkadot-labs/hdkd"
import { entropyToMiniSecret, mnemonicToEntropy } from "@polkadot-labs/hdkd-helpers"

import { buildTeleport } from "../src/teleport"
import { forkAh } from "../src/fork-clients"

// "//Alice" — the canonical dev mnemonic used in Polkadot test environments
const ALICE_MNEMONIC =
  "bottom drive obey lake curtain smoke basket hold race lonely fit walk"
const ALICE_ADDRESS = "1ChFWeNRLarAPRCTM3bfJmncJbSAbSS9yqjueWz7jX7iTVZ"

function aliceSigner() {
  const entropy = mnemonicToEntropy(ALICE_MNEMONIC)
  const miniSecret = entropyToMiniSecret(entropy)
  const derive = sr25519CreateDerive(miniSecret)
  const { publicKey, sign } = derive("//Alice")
  return getPolkadotSigner(publicKey, "Sr25519", sign)
}

async function main() {
  const signer = aliceSigner()

  // Subscribe BEFORE submitting so we don't miss the event
  const deposits = forkAh.event.Balances.Deposit.watch(() => true).subscribe(
    (e) => console.log("AH Deposit:", e),
  )

  const tx = buildTeleport(ALICE_ADDRESS, 1_000_000_000n) // 0.1 PAS
  const finalized = await tx.signAndSubmit(signer)
  console.log("Teleport finalized on fork:", finalized.txHash)

  // Give the parachain a few seconds to process the XCM message
  await new Promise((r) => setTimeout(r, 8_000))
  deposits.unsubscribe()
}

main().catch(console.error)
```

When you run this you should see, in order:

1. A `Teleport finalized` line from the relay fork.
2. After 6–12 seconds, an `AH Deposit` line on the parachain fork.

That gap is the XCM message traveling — Chopsticks simulates the
validator passing of UMP/DMP messages every relay block.

## Forcing block production

By default Chopsticks doesn't produce blocks on its own (it's a fork,
not a live chain). You move time forward by asking it to produce blocks
manually. There are two ways:

**RPC method:**

```ts
import { createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"

const raw = createClient(getWsProvider("ws://127.0.0.1:8000")).rawClient
await raw.request("dev_newBlock", [{ count: 3 }])
```

**Via the Chopsticks console:** when you start Chopsticks it exposes an
interactive prompt. Type `b 3` to mint 3 new blocks on the relay.

For XCM you usually need to produce blocks on **both** chains, alternating
— UMP travels relay→para on a relay block, DMP travels para→relay on a
para block. The default automatic timer in Chopsticks does this for you.
But if you're scripting headlessly, alternate manual calls.

## Reading the XCM trace

The whole reason to use Chopsticks is the per-instruction trace. With
the right log level you can see exactly what the XCM Executor does.

```bash
LOG_LEVEL=trace pnpm chopsticks xcm \
  --relaychain=paseo \
  --parachain=paseo-asset-hub \
  | grep -i 'xcm\|MessageQueue'
```

For the teleport above, you'll see lines like:

```
[xcm-executor] Processing: WithdrawAsset { assets: [...] }
[xcm-executor] Processing: ClearOrigin
[xcm-executor] Processing: BuyExecution { fees: ..., weight_limit: Unlimited }
[xcm-executor] Processing: DepositAsset { assets: ..., beneficiary: ... }
[xcm-executor] Success: refund 13_456_789 weight
```

These are the actual XCM v3/v4 instructions emitted by `limited_teleport_assets`.
The relay constructs them, the parachain executes them.

When a teleport vanishes, one of those lines tells you why. Common
failures:

| Trace line | Meaning | Fix |
|-----------|---------|-----|
| `BuyExecution { weight_limit: Unlimited }` then `BarrierError` | Destination's XcmBarrier refused to execute the message because it was sent from a not-trusted origin | Verify the destination treats your origin as trusted (system parachain vs general) |
| `Trap(15)` | Asset Trap — the executor stopped and stashed leftover funds | Increase `weight_limit`, fix asset accounting |
| `BadOrigin` | Cross-chain origin conversion failed | Wrong `parents` count in `dest` or `beneficiary` |
| `FailedToTransactAsset` | The asset's transactor (Balances, Tokens, etc.) refused to mint | Asset Hub doesn't trust the relay for this token, you needed reserve transfer not teleport |

## A diagnostic workflow you can copy

You have a failing XCM submission in production. Here's the path from
"silence" to root cause in ten minutes:

1. **Capture the failed extrinsic's call data.** From your app, log the
   hex-encoded call before `signSubmitAndWatch`.

2. **Fork the source chain with Chopsticks** (the relay or the source
   parachain).

3. **Decode and resubmit** against the fork using PAPI:

   ```ts
   const callData = "0x6300..." // from production logs
   const decoded = forkRelay.txFromCallData(Binary.fromHex(callData))
   await decoded.signAndSubmit(aliceSigner())
   ```

4. **Watch the trace.** With `LOG_LEVEL=trace` you'll see exactly which
   instruction failed and why.

5. **Modify and re-replay.** Tweak the call, resubmit. Chopsticks state
   is local, so you can iterate as fast as your runtime executes —
   typically a few seconds per round-trip.

This works for any XCM extrinsic, not just teleports. Reserve transfers,
arbitrary `XcmPallet.send`, hrmp channel setup — same workflow.

## Saving and restoring a known state

Investigating intermittent failures gets easier if you can snapshot the
fork. Chopsticks does this via its sqlite db file:

```bash
# Stop the fork, copy the db
cp db.sqlite db.before-replay.sqlite

# Restart from the snapshot
pnpm chopsticks xcm \
  --relaychain=paseo \
  --parachain=paseo-asset-hub \
  --db=./db.before-replay.sqlite
```

This lets you bisect long sequences — "did the bug appear before or
after extrinsic X?" — without re-downloading state.

## Going further

This chapter scratched the surface. Three useful next steps:

- **Test XCM upgrades**: fork a chain *before* a runtime upgrade,
  override the runtime with a new wasm blob (`--wasm-override`), and
  see how XCM behavior changes. The Polkadot fellowship uses this for
  every runtime release.
- **Simulate a parachain you don't have credentials on**: with
  `mock-signature-host`, sign as governance, the curator account, or a
  council multisig. Reproduces bugs that only manifest at privileged
  origins.
- **Continuous fork tests**: run Chopsticks in CI against `master`
  metadata and replay your app's XCM flow on every PR. A 90-second
  smoke test that would otherwise need testnet PAS.

## End of the cookbook

You now have:

- A working PAPI client against Paseo (chapter 1)
- A live teleport flow with event watching (chapter 2)
- A debugger that turns XCM silence into instruction-level traces
  (this chapter)

These three together cover ~80% of what an XCM-using dApp developer
needs day-to-day. The remaining 20% — runtime constants tuning, custom
XCM weight calculation, hrmp channel orchestration — lives in the
[XCM Format spec](https://github.com/paritytech/xcm-format) and is best
absorbed by reading the [polkadot-sdk xcm crate](https://github.com/paritytech/polkadot-sdk/tree/master/polkadot/xcm).

If this cookbook helped you, please open an issue or PR on the source
repository — it makes future chapters easier to fund.
