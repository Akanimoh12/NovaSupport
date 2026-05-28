# Contract Security Considerations

This document covers the security assumptions, trust model, and known limitations of the
`SupportPageContract` in `contracts/support_page/src/lib.rs`. Read it before making any
changes to the contract.

---

## What the contract guarantees

- **Supporter authorization.** `supporter.require_auth()` is called before any state change.
  No address can invoke `support()` on behalf of another address without that address
  signing the transaction.

- **Positive-amount enforcement.** `amount <= 0` panics with `"amount must be positive"`.
  Zero-value and negative-value calls are rejected at the contract level.

- **Persistent support count.** `SupportCount` is stored in persistent storage and survives
  ledger closings. The SDK automatically manages the entry TTL on writes; entries will not
  silently disappear between calls within their TTL window.

- **Structured event emission.** Every successful call emits a `SupportEvent` containing
  `supporter`, `recipient`, `amount`, `asset_code`, and `message` under the topic `"support"`.
  This gives indexers and the backend a consistent, verifiable record of each support action.

---

## What the contract does NOT guarantee

- **No fund custody or transfer.** The contract does not hold, escrow, or move tokens.
  Payments happen as a separate Stellar payment operation in the same transaction envelope,
  outside the contract's execution. If the payment operation fails, the contract invocation
  may still succeed (and vice versa) depending on transaction construction.

- **No recipient validation.** The contract does not verify that `recipient` is a registered
  NovaSupport profile, a valid Stellar account, or has any relationship to the platform.
  Any address can be passed as `recipient`.

- **No duplicate-support prevention.** The same `supporter` can call `support()` multiple
  times for the same `recipient`. `SupportCount` is a global counter, not per-supporter.

- **No message validation.** `message` is accepted as any `soroban_sdk::String` and placed
  directly into the emitted event. The contract does not enforce length limits, content
  policy, or encoding beyond what the Soroban host imposes.

- **No asset verification.** `asset_code` is a free-form string. The contract does not
  verify that the string corresponds to a real Stellar asset or matches the payment
  operation in the transaction envelope.

---

## Trust model

- **Permissionless.** Anyone can call `support()` for any recipient address. There is no
  allowlist, role check, or admin gate on who may submit a support action.

- **No admin key.** There is no admin or owner address stored in the contract. No upgrade
  authority, pause function, or privileged operation exists.

- **Immutable once deployed.** The contract has no `upgrade` entry point or admin key. Once deployed to a contract ID, the WASM cannot be altered. This ensures that the logic seen at the time of deployment is what will always execute for that ID. Any "upgrade" requires deploying a new contract instance and updating the platform to use the new ID.

- **Events are trusted as-is.** The backend and frontend are responsible for validating
  event data. The contract emits whatever values it receives; it does not cross-check
  `asset_code` against the payment, or `amount` against any token balance.

- **`support_count` is a best-effort metric.** It counts invocations of `support()`, not
  unique supporters or verified payments. Do not use it as a financial audit trail.

---

## Things to watch for when extending

- **Always call `require_auth()` for any address performing an action.** Omitting it allows
  anyone to invoke that function on behalf of any address.

- **Extend TTL on persistent storage writes.** If you add new persistent storage entries,
  call `env.storage().persistent().extend_ttl(key, threshold, extend_to)` after each write,
  or entries will expire and silently return `None` on the next read. The current contract
  relies on the SDK's automatic bump on `set()` — verify this behaviour holds for any new
  entry type you introduce.

- **Avoid storing unbounded data in persistent storage at scale.** Storing full message
  strings per supporter would make storage costs grow linearly with usage. Use events
  (as this contract does) for variable-length, per-call data.

- **Do not assume `amount` reflects a real token transfer.** If future logic gates behaviour
  on `amount` (e.g., tiered rewards), verify the corresponding payment operation is
  atomically linked in the transaction envelope — the contract currently makes no such check.

- **Test with `mock_all_auths()` but require real auth in production flows.** Tests use
  `env.mock_all_auths()` to bypass signature checks. Ensure any new function that touches
  sensitive state calls `require_auth()` on the appropriate address before shipping.

- **Global state is shared across all callers.** `SupportCount` is a single contract-wide
  counter. If you introduce per-user or per-recipient state, use a composite `DataKey`
  variant (e.g., `DataKey::UserCount(Address)`) to avoid collisions.
