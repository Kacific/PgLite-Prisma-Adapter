# @kacific/pglite-prisma-adapter

> Docker-free in-process Postgres for Prisma tests. Backed by [PgLite](https://pglite.dev) (real PostgreSQL compiled to WASM) via the Prisma 5 driver-adapter pattern.

Spins a fresh Postgres-shaped database per test suite, in-process, with zero external dependencies. No Docker. No local Postgres install. No testcontainers orchestration. Real Postgres SQL parser and execution semantics.

## Why this exists

Prisma 5.10+ ships the driver-adapter pattern. PgLite (2024+) ships real PostgreSQL compiled to WASM, runnable inside Node. Combining them gives the fastest, simplest test-database story available for a Prisma project today.

The integration is non-trivial. Four non-obvious gotchas sit between "should just work" and "actually works." This package codifies them, ships a working factory, and documents the edges so you can adopt PgLite-for-tests in five lines of code instead of a week of yak-shaving.

## Install

```bash
pnpm add -D @kacific/pglite-prisma-adapter \
  @prisma/adapter-pg \
  @electric-sql/pglite \
  pg
```

Peer dependencies (versions must align with your Prisma client):

| Peer | Required version |
|---|---|
| `@prisma/client` | `^5.10.0` (driver-adapter support landed here) |
| `@prisma/adapter-pg` | Match your `@prisma/client` major.minor (e.g. `5.22.x` for client `5.22.x`) |
| `@electric-sql/pglite` | `^0.4.0` |
| `pg` | `^8.13.0` (for `Pool` and `types.builtins`) |

Enable the driver-adapter preview in `prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

## Quick start

### 1. Generate the bootstrap SQL once

PgLite does not run Prisma migrations. Cache the schema as raw CREATE statements:

```bash
DATABASE_URL="postgresql://stub" prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > test/sql/postgres-bootstrap.sql
```

Regenerate whenever your schema changes. (Tip: redirect stdout only. `2>&1` will contaminate the SQL with shell or pnpm warning noise that PgLite then refuses to parse.)

### 2. Use it in a test

```typescript
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { createPgLitePrisma, type PgLitePrismaHandle } from '@kacific/pglite-prisma-adapter';
import { readFileSync } from 'node:fs';

const bootstrapSql = readFileSync('./test/sql/postgres-bootstrap.sql', 'utf8');

describe('my feature', () => {
  let handle: PgLitePrismaHandle;

  beforeAll(async () => {
    handle = await createPgLitePrisma({ bootstrapSql });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('reads and writes', async () => {
    await handle.prisma.item.create({ data: { id: '1', name: 'first' } });
    const all = await handle.prisma.item.findMany();
    expect(all).toHaveLength(1);
  });
});
```

Each call to `createPgLitePrisma()` returns a fresh, isolated PGlite. No shared state across suites.

## API

```typescript
interface PgLitePrismaHandle {
  readonly prisma: PrismaClient;
  readonly db: PGlite;
  readonly pool: PgLiteAsPgPool;
  close(): Promise<void>;
}

function createPgLitePrisma(opts: {
  bootstrapSql: string;     // schema as raw CREATE statements
}): Promise<PgLitePrismaHandle>;

function createTestPrisma(opts: {
  bootstrapSql: string;
}): Promise<{
  prisma: PrismaClient;
  close: () => Promise<void>;
}>;

class PgLiteAsPgPool extends Pool { /* ... */ }
function wrapPgLiteAsPgPool(db: PGlite): PgLiteAsPgPool;
```

## The four gotchas (the value of this package)

If you're integrating PgLite + Prisma 5 from scratch, you will hit each of these in sequence. They're not documented anywhere central. The package's source files (`src/pglite-as-pg-pool.ts`, `src/prisma-pglite-factory.ts`) embed the rationale inline; the summary:

### 1. `instanceof Pool` — extend, don't compose

`@prisma/adapter-pg`'s `PrismaPg` constructor does `if (!(pool instanceof Pool)) throw new Error("PrismaPg must be initialized with an instance of Pool")`. A composition-shaped shim fails the check immediately.

**Fix:** extend `pg.Pool`. The super constructor runs with no options; every method that would open a real connection is overridden to route to PgLite instead.

### 2. The adapter calls the config-object form of `query()`

Documentation examples show `pool.query(text, values)`. The adapter actually uses the pg-shaped config-object form:

```typescript
client.query({ text, values, rowMode: 'array', types: { getTypeParser } })
```

A shim that only handles `(text, values)` throws `ERR_INVALID_ARG_TYPE` from PgLite (it receives the config object where it expected a SQL string).

**Fix:** detect whether the first argument is a string or a config object; pass `rowMode` and `types` through to PgLite's native query options.

### 3. `types.getTypeParser` cannot be wrapped in a Proxy

The adapter's `types` field is `{ getTypeParser: (oid, format) => parserFn }`. PgLite's `parsers` option wants a concrete record: `Record<oid, parserFn>`. The intuitive bridge is a Proxy:

```typescript
// THIS DOES NOT WORK
const parsers = new Proxy({}, {
  get: (_, oid) => types.getTypeParser(Number(oid), 'text')
});
```

PgLite enumerates `Object.keys(parsers)` to install them. `Object.keys` does not trigger Proxy's `get` trap. TIMESTAMP / TIMESTAMPTZ / JSONB silently return native types instead of strings, and Prisma fails downstream with `Conversion failed: expected a string in column ...`.

**Fix:** build the parsers record concretely at construction. Walk `pg.types.builtins`, ask the adapter's shim for each oid's text parser, store in a plain object. Add a small list of array-type oids that `builtins` does not enumerate.

### 4. Version pinning: match `@prisma/adapter-pg` to your `@prisma/client`

The adapter follows Prisma's major version bumps. `@prisma/adapter-pg@7.x` is for Prisma 7. With Prisma 5.x, installing the latest adapter throws confusing engine-version mismatch errors at runtime.

**Fix:** pin to the matching major.minor (e.g. `5.22.0` for client `5.22.0`).

## Limitations

**Concurrency.** PgLite is single-process. Queries fired concurrently against the same instance serialise through the JS event loop, not parallel Postgres backends. Tests that exercise concurrency contracts (advisory locks, `SKIP LOCKED`, etc.) should also run against a real Postgres at least nightly.

**Transactions.** `BEGIN` / `COMMIT` / `ROLLBACK` route through PgLite's single connection. Nested transactions and savepoints are minimally exercised.

**Type oid divergence.** PgLite's `fields[].dataTypeID` may differ from real Postgres for some types. The parsers record handles most cases; edge cases (BIGINT, JSONB) deserve a careful eye when your schema grows new types.

**Test-runner contention.** Avoid configurations that fan out parallel workers all running the full suite with their own PgLite instances. The contention can trigger 30s+ timeouts. Prefer a single test process at the repo root, or scope each package's test config to its own files.

## When to reach for real Postgres instead

PgLite-for-tests covers the vast majority of Prisma test scenarios. Reach for a real Postgres (testcontainers, or a nightly CI matrix) when:

- Your code exercises Postgres-specific concurrency primitives (advisory locks, listen/notify, `SKIP LOCKED`).
- You depend on extensions PgLite does not bundle (PostGIS, TimescaleDB, etc.).
- You need to verify behaviour under multi-backend connection contention.
- You're nearing a release where production confidence matters more than dev-loop speed.

A common pattern: PgLite in PR-time CI (fast, parallel-friendly), real Postgres in nightly CI (slower, catches divergence).

## Claude Code skill

If you use [Claude Code](https://claude.com/claude-code), this repo also ships a skill that teaches the four gotchas to your agent. See [`claude-skill/`](./claude-skill/).

## License

[MIT](./LICENSE)

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).
