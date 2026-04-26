# NovaSupport Contract

This Soroban workspace contains a single minimal contract under `contracts/support_page/`.

## Purpose

The initial contract is intentionally small:

- accept a support action
- require supporter authorization
- emit a support event
- keep a simple support counter
- comprehensive error handling with specific error codes

## Error Handling

The contract now includes comprehensive error codes for better debugging and user experience. See [ERROR_CODES.md](ERROR_CODES.md) for detailed documentation of all error codes and their meanings.

Key error categories:
- **Input validation errors** (1-99): Invalid amounts, messages, asset codes
- **Authorization errors** (100-199): Admin access, recipient permissions
- **Contract state errors** (200-299): Initialization, pause state
- **Balance and transfer errors** (300-399): Insufficient funds, withdrawal limits
- **Storage and data errors** (400-499): Missing data, recipient not found
- **Asset and token errors** (500-599): Invalid assets, token client issues

## Why It Is Small

The MVP only needs to show clear Soroban intent for the Stellar Wave submission. This contract is a safe extension point for future work such as:

- token transfer enforcement
- recurring support logic
- onchain profile ownership
- milestones or attestations

## Deployed Contract (Testnet)

| Field | Value |
|---|---|
| Contract ID | `NEXT_PUBLIC_CONTRACT_ID` (set in `frontend/.env.local`) |
| Network | Stellar Testnet |
| Explorer | https://stellar.expert/explorer/testnet/contract/&lt;id&gt; |

The contract ID is recorded in `frontend/.env.example` as `NEXT_PUBLIC_CONTRACT_ID`. After deploying, set the actual ID in `frontend/.env.local` (not committed) and update this table with the deployed contract ID and deployer address.

## Testing & Verification

Before deploying, always run the local test suite to ensure contract logic is correct.

```bash
cd contract
cargo test
```

For more comprehensive verification, you can use the Stellar CLI to simulate invocations on a local or testnet network.

## Contract Invocation

After deploying the contract to Testnet, you can invoke the `support()` function using either the Stellar CLI or JavaScript.

### CLI Example

Use the Stellar CLI to call the contract directly:

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source mykey \
  -- support \
  --supporter <SUPPORTER_ADDRESS> \
  --recipient <RECIPIENT_ADDRESS> \
  --amount 10000000 \
  --asset_code XLM \
  --message "Great work!"
```

**Note:** The `amount` is in stroops (1 XLM = 10,000,000 stroops).

### JavaScript Example

Use `@stellar/stellar-sdk` to invoke the contract from JavaScript:

```javascript
import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Address,
  nativeToScVal,
} from "@stellar/stellar-sdk";

const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");
const contract = new Contract("<CONTRACT_ID>");

// Get the supporter account
const account = await server.getAccount("<SUPPORTER_ADDRESS>");

// Build the transaction
const tx = new TransactionBuilder(account, {
  fee: BASE_FEE,
  networkPassphrase: Networks.TESTNET,
})
  .addOperation(
    contract.call(
      "support",
      nativeToScVal(Address.fromString("<SUPPORTER_ADDRESS>"), {
        type: "address",
      }),
      nativeToScVal(Address.fromString("<RECIPIENT_ADDRESS>"), {
        type: "address",
      }),
      nativeToScVal(10000000, { type: "i128" }), // amount in stroops
      nativeToScVal("XLM", { type: "string" }),
      nativeToScVal("Great work!", { type: "string" }),
    ),
  )
  .setTimeout(30)
  .build();

// Prepare the transaction
const preparedTx = await server.prepareTransaction(tx);

// Sign with Freighter or a keypair
// preparedTx.sign(keypair);

// Submit the transaction
// const result = await server.sendTransaction(preparedTx);
```

**Note:** Remember to sign the transaction with the supporter's keypair or using a wallet like Freighter before submitting.

### Deployment & Upgrades

#### Initial Deployment

Follow these steps to build the WASM and deploy the contract to Stellar Testnet.

**Prerequisites:**
- Rust stable toolchain with `wasm32-unknown-unknown` target.
- Stellar CLI installed (`cargo install --locked stellar-cli`).
- A funded Testnet account (e.g., `mykey`).

```bash
# Build the contract
stellar contract build

# Deploy
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/support_page.wasm \
  --network testnet \
  --source mykey
```

After a successful deploy, the CLI will print the **Contract ID**. Update your frontend `.env.local` with:
`NEXT_PUBLIC_CONTRACT_ID=<YOUR_CONTRACT_ID>`

#### Upgrade Strategy

**The NovaSupport contract is immutable once deployed.** There is no built-in "upgrade" function or admin key that can swap the WASM code for an existing Contract ID.

To "upgrade" the contract:
1. **Deploy a new instance:** Re-run the deployment steps with your updated WASM. This will generate a **new Contract ID**.
2. **Update the Frontend:** Point your frontend application to the new Contract ID.
3. **State Migration:** If the old contract has critical state (like `support_count`) that must be preserved, you must:
   - Export the state from the old contract (via events or queries).
   - Write a migration script or include an "initialization" function in the new contract that imports the old values.
   - Note: For the current minimal version, a simple counter reset is usually acceptable for Dev/Testnet iterations.

**Security Warning:** Always verify the new WASM hash against the source code before deploying to a production-like environment.

Notes

- If you prefer a browser-based alternative for funding testnet accounts, see: https://laboratory.stellar.org
- Keep your deploy key secure; consider using ephemeral or CI-specific keys for automated deploys.
### Query Functions

You can also query the contract state:

**Get global support count:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- support_count
```

**Get recipient-specific support count:**

```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- recipient_count \
  --recipient <RECIPIENT_ADDRESS>
```
