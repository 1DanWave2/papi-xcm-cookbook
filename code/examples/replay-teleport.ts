/**
 * Replay a teleport against a Chopsticks fork — chapter 3.
 *
 * Before running this, start Chopsticks in a separate terminal:
 *   pnpm chopsticks xcm --relaychain=paseo --parachain=paseo-asset-hub
 *
 * (Or use the chopsticks.yml config in the repo root.)
 *
 * Run:
 *   pnpm replay
 */

import { firstValueFrom } from "rxjs"
import { take, timeout } from "rxjs/operators"

import {
  ALICE_ADDRESS,
  aliceSigner,
  forkAh,
  forkAhClient,
  forkRelayClient,
} from "../src/fork-clients"
import { buildTeleport } from "../src/teleport"

const AMOUNT = 100_000_000_000n // 1 PAS

async function main() {
  console.log("Replaying teleport on Chopsticks fork…")

  const signer = aliceSigner()
  const tx = buildTeleport(ALICE_ADDRESS, AMOUNT)

  const finalized = await tx.signAndSubmit(signer)
  console.log("Relay tx finalized:", finalized.txHash)

  console.log("Waiting up to 30s for AH Balances.Deposit…")
  const deposit = await firstValueFrom(
    forkAh.event.Balances.Deposit.watch(
      ({ who }) => who === ALICE_ADDRESS,
    ).pipe(take(1), timeout({ first: 30_000 })),
  )
  console.log("🎉 Replayed deposit:", deposit)
}

main()
  .catch((err) => {
    console.error("❌", err)
    process.exitCode = 1
  })
  .finally(() => {
    forkRelayClient.destroy()
    forkAhClient.destroy()
  })
