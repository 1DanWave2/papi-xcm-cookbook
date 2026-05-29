import { paseo, pasAh } from "@polkadot-api/descriptors"
import { createClient } from "polkadot-api"
import { getWsProvider } from "polkadot-api/ws-provider/web"

/**
 * Public Paseo RPC endpoints. Swap them for any other provider if you
 * hit throttling — see chapter 2 appendix for a Smoldot alternative.
 */
const PASEO_RPC = "wss://paseo-rpc.dwellir.com"
const PASEO_AH_RPC = "wss://paseo-asset-hub-rpc.dwellir.com"

export const relayClient = createClient(getWsProvider(PASEO_RPC))
export const ahClient = createClient(getWsProvider(PASEO_AH_RPC))

export const relayApi = relayClient.getTypedApi(paseo)
export const ahApi = ahClient.getTypedApi(pasAh)

/** Disconnect both clients — call before exiting a CLI script. */
export function disconnect() {
  relayClient.destroy()
  ahClient.destroy()
}
