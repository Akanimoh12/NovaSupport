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

interface TxCreateArg {
  data: Record<string, unknown>;
}

interface TxUpdateArg {
  where: { id: string };
  data: { nextRunAt: Date };
}

interface FindManyArg {
  where: { status: string; nextRunAt: { lte: Date } };
}

function getFirstArg<T>(mockFn: ReturnType<typeof mock.fn>): T {
  return (mockFn.mock.calls[0]!.arguments[0] as unknown) as T;
}

function buildPrismaMock(overrides: {
  recurringSupports?: unknown[];
} = {}) {
  const txRecurringSupportUpdate = mock.fn(() => Promise.resolve({}));
  const txRecurringSupportExecutionCreate = mock.fn(() => Promise.resolve({}));

  const recurringSupportFindMany = mock.fn(() =>
    Promise.resolve(overrides.recurringSupports ?? [makeSupport()]),
  );

  const $transaction = mock.fn((cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      recurringSupportExecution: { create: txRecurringSupportExecutionCreate },
      recurringSupport: { update: txRecurringSupportUpdate },
    };
    return cb(tx);
  });

  return {
    recurringSupport: { findMany: recurringSupportFindMany },
    $transaction,
    txRecurringSupportExecutionCreate,
    txRecurringSupportUpdate,
  };
}

test("processDueRecurringSupports processes active due supports", async () => {
  const mockPrisma = buildPrismaMock();

  await processDueRecurringSupports(mockPrisma as any);

  assert.equal(mockPrisma.recurringSupport.findMany.mock.callCount(), 1);
  assert.equal(mockPrisma.$transaction.mock.callCount(), 1);
  assert.equal(mockPrisma.txRecurringSupportExecutionCreate.mock.callCount(), 1);

  const createCall = getFirstArg<TxCreateArg>(mockPrisma.txRecurringSupportExecutionCreate);
  assert.equal(createCall.data.recurringSupportId, "drip-1");
  assert.equal(createCall.data.status, "pending");
});

test("processDueRecurringSupports advances nextRunAt for weekly frequency", async () => {
  const mockPrisma = buildPrismaMock({
    recurringSupports: [makeSupport({ frequency: "weekly" })],
  });

  await processDueRecurringSupports(mockPrisma as any);

  assert.equal(mockPrisma.txRecurringSupportUpdate.mock.callCount(), 1);
  const updateCall = getFirstArg<TxUpdateArg>(mockPrisma.txRecurringSupportUpdate);
  assert.equal(updateCall.where.id, "drip-1");
  const now = new Date();
  const expectedNext = new Date(now);
  expectedNext.setDate(expectedNext.getDate() + 7);
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

  const updateCall = getFirstArg<TxUpdateArg>(mockPrisma.txRecurringSupportUpdate);
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
      recurringSupportExecution: { create: mock.fn(() => Promise.resolve({})) },
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

  assert.equal($transaction.mock.callCount(), 2);
});

test("processDueRecurringSupports filters for active status with due nextRunAt", async () => {
  const mockPrisma = buildPrismaMock();

  await processDueRecurringSupports(mockPrisma as any);

  const findManyCall = getFirstArg<FindManyArg>(mockPrisma.recurringSupport.findMany);
  assert.equal(findManyCall.where.status, "active");
  assert.ok(findManyCall.where.nextRunAt.lte instanceof Date);
});

// ── Batch pagination tests (issue #654) ──────────────────────────────────────

test("processDueRecurringSupports uses take: 100 to limit each query", async () => {
  const mockPrisma = buildPrismaMock({ recurringSupports: [] });

  await processDueRecurringSupports(mockPrisma as any);

  const findManyArg = getFirstArg<{ take: number }>(mockPrisma.recurringSupport.findMany);
  assert.equal(findManyArg.take, 100);
});

test("processDueRecurringSupports stops after one query when batch is smaller than 100", async () => {
  // 2 records returned — well under the batch size, so no second query needed
  const mockPrisma = buildPrismaMock({
    recurringSupports: [makeSupport({ id: "drip-1" }), makeSupport({ id: "drip-2" })],
  });

  await processDueRecurringSupports(mockPrisma as any);

  assert.equal(mockPrisma.recurringSupport.findMany.mock.callCount(), 1);
});

test("processDueRecurringSupports queries again when a full batch of 100 is returned", async () => {
  const firstBatch = Array.from({ length: 100 }, (_, i) =>
    makeSupport({ id: `drip-${i}` }),
  );

  let call = 0;
  const txRecurringSupportUpdate = mock.fn(() => Promise.resolve({}));
  const txRecurringSupportExecutionCreate = mock.fn(() => Promise.resolve({}));
  const recurringSupportFindMany = mock.fn(() => {
    call++;
    return Promise.resolve(call === 1 ? firstBatch : []);
  });
  const $transaction = mock.fn((cb: (tx: unknown) => Promise<void>) => {
    const tx = {
      recurringSupportExecution: { create: txRecurringSupportExecutionCreate },
      recurringSupport: { update: txRecurringSupportUpdate },
    };
    return cb(tx);
  });
  const mockPrisma = {
    recurringSupport: { findMany: recurringSupportFindMany },
    $transaction,
  };

  await processDueRecurringSupports(mockPrisma as any);

  // First call returned a full batch → second call made to check for more
  assert.equal(recurringSupportFindMany.mock.callCount(), 2);
  // All 100 records in the first batch were processed
  assert.equal($transaction.mock.callCount(), 100);
});
