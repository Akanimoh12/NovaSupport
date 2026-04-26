# Soroban Contract Error Codes

This document describes all error codes used in the NovaSupport Soroban contract and their meanings.

## Error Code Categories

Error codes are organized into ranges by category:

- **1-99**: Input validation errors
- **100-199**: Authorization errors  
- **200-299**: Contract state errors
- **300-399**: Balance and transfer errors
- **400-499**: Storage and data errors
- **500-599**: Asset and token errors

## Error Code Reference

### Input Validation Errors (1-99)

| Code | Error Name | Description |
|------|------------|-------------|
| 1 | `InvalidAmount` | Generic invalid amount error (legacy) |
| 2 | `ZeroAmount` | Amount cannot be zero |
| 3 | `NegativeAmount` | Amount cannot be negative |
| 4 | `EmptyMessage` | Message cannot be empty when required |
| 5 | `MessageTooLong` | Message exceeds maximum length (280 characters) |
| 6 | `InvalidAssetCode` | Asset code is invalid or empty |

### Authorization Errors (100-199)

| Code | Error Name | Description |
|------|------------|-------------|
| 100 | `Unauthorized` | Generic unauthorized access (legacy) |
| 101 | `NotAdmin` | Caller is not the contract admin |
| 102 | `NotRecipient` | Caller is not the intended recipient |
| 103 | `CallerNotAuthorized` | Caller lacks required authorization |

### Contract State Errors (200-299)

| Code | Error Name | Description |
|------|------------|-------------|
| 200 | `ContractPaused` | Contract is currently paused |
| 201 | `ContractNotInitialized` | Contract has not been initialized |
| 202 | `AlreadyInitialized` | Contract has already been initialized |

### Balance and Transfer Errors (300-399)

| Code | Error Name | Description |
|------|------------|-------------|
| 300 | `InsufficientBalance` | Supporter has insufficient token balance |
| 301 | `InsufficientContractBalance` | Contract has insufficient balance for withdrawal |
| 302 | `TransferFailed` | Token transfer operation failed |
| 303 | `WithdrawAmountExceedsBalance` | Withdrawal amount exceeds recipient's balance |

### Storage and Data Errors (400-499)

| Code | Error Name | Description |
|------|------------|-------------|
| 400 | `StorageError` | Generic storage operation error |
| 401 | `DataNotFound` | Required data not found in storage |
| 402 | `RecipientNotFound` | Recipient has no balance for the specified asset |

### Asset and Token Errors (500-599)

| Code | Error Name | Description |
|------|------------|-------------|
| 500 | `InvalidAsset` | Asset address is invalid |
| 501 | `AssetNotSupported` | Asset is not supported by the contract |
| 502 | `TokenClientError` | Error interacting with token contract |

## Usage Examples

### Handling Specific Errors

```rust
match client.support(&supporter, &recipient, &asset, &amount, &code, &message) {
    Ok(count) => println!("Support successful, count: {}", count),
    Err(Error::ZeroAmount) => println!("Amount must be greater than zero"),
    Err(Error::ContractPaused) => println!("Contract is currently paused"),
    Err(Error::InsufficientBalance) => println!("Insufficient token balance"),
    Err(e) => println!("Other error: {:?}", e),
}
```

### Common Error Scenarios

1. **Support Transaction Errors**:
   - `ZeroAmount` (2): User tries to send 0 tokens
   - `NegativeAmount` (3): Invalid negative amount
   - `ContractPaused` (200): Contract is paused by admin
   - `InsufficientBalance` (300): User doesn't have enough tokens
   - `MessageTooLong` (5): Support message exceeds 280 characters

2. **Withdrawal Errors**:
   - `NotRecipient` (102): Someone other than recipient tries to withdraw
   - `WithdrawAmountExceedsBalance` (303): Trying to withdraw more than available
   - `RecipientNotFound` (402): No balance exists for this recipient/asset pair

3. **Admin Operation Errors**:
   - `NotAdmin` (101): Non-admin tries to pause/unpause
   - `ContractNotInitialized` (201): Operations before initialization
   - `AlreadyInitialized` (202): Trying to initialize twice

## Migration Notes

Some error codes have been updated for better specificity:

- Legacy `InvalidAmount` (1) is now split into `ZeroAmount` (2) and `NegativeAmount` (3)
- Legacy `Unauthorized` (100) is now split into `NotAdmin` (101) and `NotRecipient` (102)
- New initialization checks prevent operations on uninitialized contracts

## Best Practices

1. **Always check for initialization** before performing operations
2. **Validate inputs** on the client side to avoid unnecessary transaction fees
3. **Handle specific error codes** rather than generic error catching
4. **Provide user-friendly error messages** based on error codes
5. **Test all error scenarios** in your integration tests