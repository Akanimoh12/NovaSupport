-- AlterTable: Add supporterAddress to RecurringSupport
ALTER TABLE "RecurringSupport" ADD COLUMN "supporterAddress" TEXT;

-- Populate supporterAddress from User.email for existing records
UPDATE "RecurringSupport" rs
SET "supporterAddress" = u.email
FROM "User" u
WHERE rs."supporterId" = u.id;

-- CreateTable
CREATE TABLE "RecurringSupportExecution" (
    "id" TEXT NOT NULL,
    "recurringSupportId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSupportExecution_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SupportTransaction" ADD COLUMN "recurringSupportExecutionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SupportTransaction_recurringSupportExecutionId_key" ON "SupportTransaction"("recurringSupportExecutionId");

-- CreateIndex
CREATE INDEX "RecurringSupportExecution_recurringSupportId_idx" ON "RecurringSupportExecution"("recurringSupportId");

-- CreateIndex
CREATE INDEX "RecurringSupportExecution_status_idx" ON "RecurringSupportExecution"("status");

-- AddForeignKey
ALTER TABLE "RecurringSupportExecution" ADD CONSTRAINT "RecurringSupportExecution_recurringSupportId_fkey" FOREIGN KEY ("recurringSupportId") REFERENCES "RecurringSupport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTransaction" ADD CONSTRAINT "SupportTransaction_recurringSupportExecutionId_fkey" FOREIGN KEY ("recurringSupportExecutionId") REFERENCES "RecurringSupportExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
