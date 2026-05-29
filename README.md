# PAPI XCM Cookbook

> A practical guide to cross-chain messaging on Polkadot using the new typed
> Polkadot-API (PAPI). Three real, runnable examples on the Paseo testnet.

**Status:** Draft (work in progress, May 2026)
**Target submission:** `polkadot-developers/bounties` PR + HackMD article
**Reference issue:** [paritytech/polkadot-sdk#6774](https://github.com/paritytech/polkadot-sdk/issues/6774)

## What's inside

| Chapter | Title | XCM concept | Code |
|---------|-------|-------------|------|
| 1 | **Getting started: PAPI + XCM v4 mental model** | XCM message structure, instructions, junctions | Setup, type generation |
| 2 | **Reserve transfer: DOT from Asset Hub to a parachain** | `ReserveAssetTransferred` flow on Paseo | Live example |
| 3 | **Debugging XCM with Chopsticks** | Fork-and-replay, message tracing | Chopsticks config |

## Why this guide exists

Polkadot SDK and PAPI are advancing fast, but the developer story for XCM in
2026 still has gaps:

- The official PAPI docs (papi.how) have **zero XCM examples**.
- The Polkadot docs site references XCM but doesn't show how to compose a
  message with the typed PAPI client.
- Issue [#6774 on polkadot-sdk](https://github.com/paritytech/polkadot-sdk/issues/6774)
  explicitly asks for end-to-end XCM tutorials in modern libraries.

This cookbook fills that gap with **runnable code** on Paseo, not
hand-waving pseudo-code.

## Audience

You are comfortable with TypeScript, you've used a JSON-RPC client before,
and you know what a parachain is in one sentence. You may have used the
older `@polkadot/api` but want to see what PAPI brings.

## How to read this

Each chapter is self-contained. Code lives in `examples/chapter-N/` and is a
plain Node.js project (`pnpm install && pnpm start`). All examples target
**Paseo testnet** so they're free to run.

## Authorship & rewards

This cookbook was assembled as a contribution to the
[`polkadot-developers/bounties`](https://github.com/polkadot-developers/bounties)
program. If you found it useful, you can sponsor follow-up chapters by
opening an issue on the source repo.
