import { paseo, pasAh } from "@polkadot-api/descriptors"
import { createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"

/**
 * Clients that point at a local Chopsticks fork.
 * Ports match the `chopsticks.yml` config in the repo root.
 */
const FORK_RELAY = "ws://127.0.0.1:8000"
const FORK_AH = "ws://127.0.0.1:8001"

export const forkRelayClient = createClient(getWsProvider(FORK_RELAY))
export const forkAhClient = createClient(getWsProvider(FORK_AH))

export const forkRelay = forkRelayClient.getTypedApi(paseo)
export const forkAh = forkAhClient.getTypedApi(pasAh)

/**
 * Deterministic dev signer for the "//Alice" account.
 * Works against Chopsticks forks started with `mock-signature-host: true`.
 */
export function aliceSigner() {
  // Imports are local so the module is only loaded when needed.
  const { getPolkadotSigner } = require("polkadot-api")
  const { sr25519CreateDerive } = require("@polkadot-labs/hdkd")
  const {
    entropyToMiniSecret,
    mnemonicToEntropy,
  } = require("@polkadot-labs/hdkd-helpers")

  const ALICE_MNEMONIC =
    "bottom drive obey lake curtain smoke basket hold race lonely fit walk"
  const entropy = mnemonicToEntropy(ALICE_MNEMONIC)
  const miniSecret = entropyToMiniSecret(entropy)
  const derive = sr25519CreateDerive(miniSecret)
  const { publicKey, sign } = derive("//Alice")
  return getPolkadotSigner(publicKey, "Sr25519", sign)
}

/** Alice's SS58 on Polkadot/Paseo address-prefix. */
export const ALICE_ADDRESS = "1ChFWeNRLarAPRCTM3bfJmncJbSAbSS9yqjueWz7jX7iTVZ"
