import {
  connectInjectedExtension,
  getInjectedExtensions,
} from "polkadot-api/pjs-signer"

/**
 * Connect to the Talisman browser extension and return a PolkadotSigner
 * for the requested address.
 *
 * Triggers Talisman's permission popup on first run. The user must enable
 * the account for the current origin.
 *
 * Throws if Talisman is not installed or the address isn't enabled.
 */
export async function getTalismanSigner(targetAddress: string) {
  const available = getInjectedExtensions()
  if (!available.includes("talisman")) {
    throw new Error(
      "Talisman extension not found. Install from https://talisman.xyz",
    )
  }

  const talisman = await connectInjectedExtension("talisman")
  const accounts = talisman.getAccounts()
  const account = accounts.find((a) => a.address === targetAddress)

  if (!account) {
    throw new Error(
      `Address ${targetAddress} is not in Talisman's enabled accounts. ` +
        "Open Talisman and grant the current origin access to this account.",
    )
  }

  return account.polkadotSigner
}
