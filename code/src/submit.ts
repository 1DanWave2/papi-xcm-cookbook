import type { TxEvent } from "polkadot-api"

import { buildTeleport } from "./teleport"
import { getTalismanSigner } from "./signer"

/** PAS has 10 decimals on Paseo. */
export const ONE_PAS = 10_000_000_000n

/**
 * Sign + submit a teleport from the user's Talisman account.
 * Resolves when the extrinsic is finalized on the relay (not yet
 * when the asset has arrived on Asset Hub — for that, see watch.ts).
 */
export async function submitTeleport(
  fromAddress: string,
  toAddress: string,
  amount: bigint,
) {
  const signer = await getTalismanSigner(fromAddress)
  const tx = buildTeleport(toAddress, amount)

  return new Promise<void>((resolve, reject) => {
    tx.signSubmitAndWatch(signer).subscribe({
      next: logEvent,
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
      console.log("📡 Broadcasted:", e.txHash)
      break
    case "txBestBlocksState":
      if (e.found) {
        console.log(
          `📦 In best block ${e.block.hash}#${e.block.index}`,
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
