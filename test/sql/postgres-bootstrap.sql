-- Cached schema bootstrap for the package's own smoke tests.
--
-- This file is the moral equivalent of the output of:
--
--   DATABASE_URL="postgresql://stub" prisma migrate diff \
--     --from-empty --to-schema-datamodel test/prisma/schema.prisma --script
--
-- For this tiny fixture schema (one model) we hand-roll it to keep the
-- repo self-contained (no Prisma generate step required to run tests).
-- Consumers should generate their own bootstrap SQL via the command above
-- and regenerate whenever their schema changes.

CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);
