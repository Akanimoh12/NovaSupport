import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { processDueRecurringSupports } from "./drip-scheduler.js";

function makeSupport(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: "drip-1",
    amount: 100n,
    assetCode: "XLM",
    frequency: "weekly",
    status: "active",
    nextRunAt: new Date(now.getTime() - 60000),
    profileId: "profile-1",
    supporterId: "supporter-1",
    profile: {
      walletAddress: "GAAAA",
    },
    supporter: {
      email: "supporter@test.com",
    },
    ...overrides,
  };
}

function buildPrismaMock(overrides: {
  recurringSupports?: unknown[];
} = {}) {
  const txRecurringSupportUpdate = mock.fn(() => Promise.resolve({}));
  const txSupportTransactionCreate = mock.fn(() => Promise.resolve({}));

  const recurringSupportFindMany = mock.fn(() =>
    Promise.resolve(overrides.recurringSupports ?? [makeSupport()]),
  );

  const $transaction = mock.fn((cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      supportTransaction: { create: txSupportTransactionCreate },
      recurringSupport: { update: txRecurringSupportUpdate },
    };
    return cb(tx);
  });

  return {
    recurringSupport: { findMany: recurringSupportFindMany },
    $transaction,
    txSupportTransactionCreate,
    txRecurringSupportUpdate,
  };
}

test("processDueRecurringSupports processes active due supports", async () => {
  const mockPrisma = buildPrismaMock();

  await processDueRecurringSupports(mockPrisma as any);

  assert.equal(mockPrisma.recurringSupport.findMany.mock.callCount(), 1);
  assert.equal(mockPrisma.$transaction.mock.callCount(), 1);
  assert.equal(mockPrisma.txSupportTransactionCreate.mock.callCount(), 1);

  const createCall = mockPrisma.txSupportTransactionCreate.mock.calls[0]!
    .arguments[0] as { data: Record<string, unknown> };
  assert.match(createCall.data.txHash as string, /^pending_/);
  assert.equal(createCall.data.status, "pending");
  assert.equal(createCall.data.recipientAddress, "GAAAA");
});

test("processDueRecurringSupports advances nextRunAt for weekly frequency", async () => {
  const mockPrisma = buildPrismaMock({
    recurringSupports: [makeSupport({ frequency: "weekly" })],
  });

  await processDueRecurringSupports(mockPrisma as any);

  assert.equal(mockPrisma.txRecurringSupportUpdate.mock.callCount(), 1);
  const updateCall = mockPrisma.txRecurringSupportUpdate.mock.calls[0]!
    .arguments[0] as { where: { id: string }; data: { nextRunAt: Date } };
  assert.equal(updateCall.where.id, "drip-1");
  const now = new Date();
  const expectedNext = new Date(now);
  expectedNext.setDate(expectedNext.getDate() + 7);
  // Allow 1 second tolerance
  assert.ok(
    Math.abs(updateCall.data.nextRunAt.getTime() - expectedNext.getTime()) < 2000,
    `nextRunAt should be ~7 days from now`,
  );
});

test("processDueRecurringSupports advances nextRunAt for monthly frequency", async () => {
  const mockPrisma = buildPrismaMock({
    recurringSupports: [makeSupport({ frequency: "monthly" })],
  });

  await processDueRecurringSupports(mockPrisma as any);

  const updateCall = mockPrisma.txRecurringSupportUpdate.mock.calls[0]!
    .arguments[0] as { where: { id: string }; data: { nextRunAt: Date } };
  const now = new Date();
  const expectedNext = new Date(now);
  expectedNext.setDate(expectedNext.getDate() + 30);
  assert.ok(
    Math.abs(updateCall.data.nextRunAt.getTime() - expectedNext.getTime()) < 2000,
    `nextRunAt should be ~30 days from now`,
  );
});

test("processDueRecurringSupports no-ops when no due supports exist", async () => {
  const mockPrisma = buildPrismaMock({ recurringSupports: [] });

  await processDueRecurringSupports(mockPrisma as any);

  assert.equal(mockPrisma.recurringSupport.findMany.mock.callCount(), 1);
  assert.equal(mockPrisma.$transaction.mock.callCount(), 0);
});

test("processDueRecurringSupports continues processing after individual failure", async () => {
  let callIndex = 0;
  const $transaction = mock.fn((cb: (tx: unknown) => Promise<void>) => {
    callIndex++;
    const tx = {
      supportTransaction: { create: mock.fn(() => Promise.resolve({})) },
      recurringSupport: { update: mock.fn(() => Promise.resolve({})) },
    };
    const result = cb(tx);
    if (callIndex === 1) {
      return Promise.reject(new Error("First drip failed"));
    }
    return result;
  });

  const mockPrisma = {
    recurringSupport: {
      findMany: mock.fn(() =>
        Promise.resolve([makeSupport({ id: "drip-1" }), makeSupport({ id: "drip-2" })]),
      ),
    },
    $transaction,
  };

  await processDueRecurringSupports(mockPrisma as any);

  // Both drips were attempted
  assert.equal($transaction.mock.callCount(), 2);
});

test("processDueRecurringSupports creates pending txHash in correct format", async () => {
  const mockPrisma = buildPrismaMock();

  await processDueRecurringSupports(mockPrisma as any);

  const createCall = mockPrisma.txSupportTransactionCreate.mock.calls[0]!
    .arguments[0] as { data: { txHash: string } };
  assert.match(createCall.data.txHash, /^pending_[0-9a-f-]{36}$/);
});

test("processDueRecurringSupports sets correct asset code from support", async () => {
  const mockPrisma = buildPrismaMock({
    recurringSupports: [makeSupport({ assetCode: "USDC" })],
  });

  await processDueRecurringSupports(mockPrisma as any);

  const createCall = mockPrisma.txSupportTransactionCreate.mock.calls[0]!
    .arguments[0] as { data: { assetCode: string } };
  assert.equal(createCall.data.assetCode, "USDC");
});

test("processDueRecurringSupports filters for active status with due nextRunAt", async () => {
  const mockPrisma = buildPrismaMock();

  await processDueRecurringSupports(mockPrisma as any);

  const findManyCall = mockPrisma.recurringSupport.findMany.mock.calls[0]!
    .arguments[0] as { where: { status: string; nextRunAt: { lte: Date } } };
  assert.equal(findManyCall.where.status, "active");
  assert.ok(findManyCall.where.nextRunAt.lte instanceof Date);
});
