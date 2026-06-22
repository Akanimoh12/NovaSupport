-- Fix schema drift: supporterId was added as nullable TEXT in
-- fix_schema_drift but schema.prisma defines it as a required String.
-- On a fresh database there are no rows, so SET NOT NULL is safe.
-- On an existing database with NULL supporterIds this will fail;
-- resolve by deleting or reassigning those rows before deploying.
ALTER TABLE "RecurringSupport" ALTER COLUMN "supporterId" SET NOT NULL;
