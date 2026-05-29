/**
 * Teleport example — chapter 2 of the cookbook.
 *
 * Sends 0.1 PAS from the user's Talisman account on Paseo Relay to
 * the same SS58 on Paseo Asset Hub. Waits for the Balances.Deposit
 * event on Asset Hub to confirm arrival.
 *
 * Run:
 *   pnpm teleport
 *
 * Requires:
 *   - Talisman extension with a Polkadot account
 *   - ≥ 1 PAS on Paseo Relay (faucet: https://faucet.polkadot.io/)
 *   - The address below has Talisman access enabled for the script's origin
 */

import { disconnect } from "../src/clients"
import { ONE_PAS, submitTeleport } from "../src/submit"
import { waitForDeposit } from "../src/watch"

/**
 * Replace with your own SS58 address. This example uses the cookbook
 * author's mainnet-prefix address — it's also a valid Paseo address
 * because the SS58 format is just a display prefix; the underlying
 * key is the same.
 */
const MY_ADDRESS = "15ou8P2L6GkKj8fio4PeNyZUUaeEJfYqtMifsM3MR8pqq8Lv"

const AMOUNT = ONE_PAS / 10n          // 0.1 PAS
const MIN_EXPECTED = AMOUNT * 9n / 10n // tolerate ≤ 10% in destination fees

async function main() {
  console.log(`Teleporting 0.1 PAS from ${MY_ADDRESS} (relay) to Asset Hub…`)

  // Subscribe BEFORE submitting so we don't miss the deposit event.
  const depositPromise = waitForDeposit(MY_ADDRESS, MIN_EXPECTED)

  await submitTeleport(MY_ADDRESS, MY_ADDRESS, AMOUNT)

  console.log("⏳ Waiting for arrival on Paseo Asset Hub…")
  const deposit = await depositPromise

  console.log("🎉 Arrived on AH:", deposit)
}

main()
  .catch((err) => {
    console.error("❌", err)
    process.exitCode = 1
  })
  .finally(disconnect)
