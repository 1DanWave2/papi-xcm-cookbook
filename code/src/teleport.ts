import {
  XcmV3Junction,
  XcmV3Junctions,
  XcmV3MultiassetAssetId,
  XcmV3MultiassetFungibility,
  XcmV3WeightLimit,
} from "@polkadot-api/descriptors"
import { AccountId, Enum } from "polkadot-api"
import { toHex } from "polkadot-api/utils"

import { relayApi } from "./clients"

/** Paseo Asset Hub parachain id. */
const ASSET_HUB_PARA_ID = 1000

const encodeAccount = AccountId().enc

/**
 * MultiLocation: parachain 1000, viewed from the relay's perspective.
 * `parents: 0` because the relay is our origin and the parachain is a
 * child segment.
 */
const ASSET_HUB_DEST = Enum("V3", {
  parents: 0,
  interior: XcmV3Junctions.X1(XcmV3Junction.Parachain(ASSET_HUB_PARA_ID)),
})

/**
 * MultiLocation: a 32-byte account on the destination chain.
 * `parents: 0` because the beneficiary is in the same context as the
 * destination (one chain hop already encoded).
 */
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

/**
 * Native PAS as seen by the relay.
 * `parents: 0, Here` — "this chain, native token."
 *
 * If you teleport in the other direction (from Asset Hub back to the
 * relay), this becomes `parents: 1, Here` because PAS lives one level
 * up from AH.
 */
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

/**
 * Build a `XcmPallet.limited_teleport_assets` extrinsic that moves
 * `amount` of PAS from the relay to `beneficiaryAddress` on Paseo
 * Asset Hub.
 *
 * The returned object is a typed PAPI extrinsic — call
 * `.signSubmitAndWatch(signer)` on it to actually submit.
 */
export function buildTeleport(beneficiaryAddress: string, amount: bigint) {
  return relayApi.tx.XcmPallet.limited_teleport_assets({
    dest: ASSET_HUB_DEST,
    beneficiary: beneficiary(beneficiaryAddress),
    assets: nativeAsset(amount),
    fee_asset_item: 0,
    weight_limit: XcmV3WeightLimit.Unlimited(),
  })
}
