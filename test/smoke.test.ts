// Smoke test for the package itself.
//
// Verifies that the four gotchas the package codifies are actually handled:
//   1. `instanceof Pool` — adapter accepts our shim without throwing
//   2. config-object query form — adapter's `query({ text, values, ... })`
//      calls reach PGlite cleanly
//   3. Concrete parsers record — TIMESTAMP and JSONB round-trip as the
//      string/object shapes Prisma's deserialiser expects
//   4. (Version pinning is verified at install time by the peer-dep ranges;
//      no runtime test required.)
//
// To run this test locally:
//   pnpm install
//   pnpm prisma generate --schema=test/prisma/schema.prisma
//   pnpm test

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { createPgLitePrisma, type PgLitePrismaHandle } from '../src/index.js';

const BOOTSTRAP_SQL = readFileSync(
  fileURLToPath(new URL('./sql/postgres-bootstrap.sql', import.meta.url)),
  'utf8',
);

describe('@kacific/pglite-prisma-adapter smoke', () => {
  let handle: PgLitePrismaHandle;

  beforeAll(async () => {
    handle = await createPgLitePrisma({ bootstrapSql: BOOTSTRAP_SQL });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('the pool shim passes the adapter instanceof Pool check', () => {
    // If this fails, the adapter would have already thrown in beforeAll.
    expect(handle.pool).toBeInstanceOf(Pool);
  });

  it('round-trips a row with String, Int, Boolean, Json, DateTime', async () => {
    // The DateTime and Json fields are the canaries: without the concrete
    // parsers record (gotcha 3) they come back as native Date / object
    // values and Prisma throws "Conversion failed" downstream.
    const created = await handle.prisma.item.create({
      data: {
        id: 'item-1',
        name: 'hello',
        count: 42,
        active: true,
        metadata: { tags: ['a', 'b'], nested: { k: 1 } },
      },
    });

    expect(created.id).toBe('item-1');
    expect(created.name).toBe('hello');
    expect(created.count).toBe(42);
    expect(created.active).toBe(true);
    expect(created.metadata).toEqual({ tags: ['a', 'b'], nested: { k: 1 } });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  it('isolates state per createPgLitePrisma() call', async () => {
    // Each call to createPgLitePrisma() returns a fresh in-memory PGlite;
    // suites do not share rows.
    const other = await createPgLitePrisma({ bootstrapSql: BOOTSTRAP_SQL });
    try {
      const rows = await other.prisma.item.findMany();
      expect(rows).toHaveLength(0);
    } finally {
      await other.close();
    }
  });

  it('supports a transactional write', async () => {
    await handle.prisma.$transaction(async (tx) => {
      await tx.item.create({ data: { id: 'tx-1', name: 'in-tx' } });
      const inTx = await tx.item.findUnique({ where: { id: 'tx-1' } });
      expect(inTx?.name).toBe('in-tx');
    });

    const after = await handle.prisma.item.findUnique({ where: { id: 'tx-1' } });
    expect(after?.name).toBe('in-tx');
  });
});
