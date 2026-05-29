import { firstValueFrom } from "rxjs"
import { take, timeout } from "rxjs/operators"

import { ahApi } from "./clients"

/**
 * Wait until a Balances.Deposit event arrives on Paseo Asset Hub
 * with the given recipient and a minimum amount.
 *
 * Throws if no matching event arrives within the timeout (default 90s).
 */
export function waitForDeposit(
  toAddress: string,
  minAmount: bigint,
  timeoutMs = 90_000,
) {
  return firstValueFrom(
    ahApi.event.Balances.Deposit.watch(
      ({ who, amount }) => who === toAddress && amount >= minAmount,
    ).pipe(take(1), timeout({ first: timeoutMs })),
  )
}
