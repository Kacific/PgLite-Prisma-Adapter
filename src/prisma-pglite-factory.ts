// Factory for building a PrismaClient against an ephemeral in-process
// PGlite instance, used by test suites that touch the database.
//
// PGlite gives real PostgreSQL parsing + execution in-process, no Docker,
// no local install.
//
// Schema bootstrap: pass a SQL string (typically the output of
// `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
// --script`) and the factory runs it at boot. Regenerate whenever the schema
// changes; a CI lint to verify the cached SQL matches the live schema is
// a worthwhile addition in your own project.
//
// Per-suite isolation: each call to `createPgLitePrisma()` returns a brand-
// new in-memory PGlite (no shared state across suites). Suites must call
// `.close()` on the returned handle in `afterAll` so the PGlite instance
// is torn down cleanly.

import { PGlite } from '@electric-sql/pglite';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { wrapPgLiteAsPgPool, type PgLiteAsPgPool } from './pglite-as-pg-pool.js';

export interface PgLitePrismaHandle {
  readonly prisma: PrismaClient;
  readonly db: PGlite;
  readonly pool: PgLiteAsPgPool;
  close(): Promise<void>;
}

export interface CreatePgLitePrismaOptions {
  /** Schema as raw CREATE statements. Typically the cached output of
   *  `prisma migrate diff --from-empty --to-schema-datamodel ... --script`. */
  readonly bootstrapSql: string;
}

// Build a fresh PrismaClient backed by an in-memory PGlite. Each call
// returns an isolated instance with the schema applied; suites do not
// share state.
//
// PGlite is a young (2024+) integration with Prisma. If a test surfaces
// an issue rooted in the adapter glue (rather than the test itself), it
// likely belongs in `pglite-as-pg-pool.ts`. Known gaps as of the initial
// release:
//   * Transactions: BEGIN / COMMIT / ROLLBACK go through PGlite's single
//     connection; nested transactions and savepoints not exhaustively
//     exercised.
//   * Type oids: PGlite's `fields[].dataTypeID` may differ from real
//     Postgres for some types; Prisma's deserialiser handles most but
//     edge cases (BIGINT, JSONB) deserve a careful eye.
//   * Concurrency: PGlite is single-process; tests that fire concurrent
//     queries against the same instance serialise through the JS event
//     loop, not parallel Postgres backends. Pair with a nightly CI run
//     against real Postgres for production confidence.
export const createPgLitePrisma = async (
  opts: CreatePgLitePrismaOptions,
): Promise<PgLitePrismaHandle> => {
  const db = new PGlite();
  // Apply the bootstrap. PGlite's `.exec()` accepts multi-statement SQL
  // and runs each statement in turn.
  await db.exec(opts.bootstrapSql);

  const pool = wrapPgLiteAsPgPool(db);
  // PgLiteAsPgPool extends pg.Pool so the adapter's `instanceof Pool`
  // guard passes; method overrides route every call to the in-process
  // PGlite instance. The cast satisfies exactOptionalPropertyTypes:
  // the overrides intentionally narrow the pg.Pool surface to the two
  // overload forms the adapter actually invokes.
  const adapter = new PrismaPg(pool as unknown as ConstructorParameters<typeof PrismaPg>[0]);
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    db,
    pool,
    close: async (): Promise<void> => {
      await prisma.$disconnect();
      await db.close();
    },
  };
};

// Convenience for the most common test shape: build a PrismaClient,
// return only the prisma + close handles (suites that don't need the
// underlying db or pool).
export const createTestPrisma = async (
  opts: CreatePgLitePrismaOptions,
): Promise<{
  prisma: PrismaClient;
  close: () => Promise<void>;
}> => {
  const handle = await createPgLitePrisma(opts);
  return {
    prisma: handle.prisma,
    close: handle.close,
  };
};
