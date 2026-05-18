---
name: pglite-prisma-tests
description: Use when setting up an in-process Postgres test database for a Prisma 5+ project, or when debugging the four common gotchas of combining @prisma/adapter-pg with @electric-sql/pglite. Fires on phrases like "PgLite + Prisma", "in-process Postgres for tests", "Docker-free test DB", "instanceof Pool error from PrismaPg", "ERR_INVALID_ARG_TYPE from PGlite", "Conversion failed: expected a string in column", "testcontainers alternative for Prisma", or when migrating away from prisma db push --force-reset against SQLite.
---

# PgLite + Prisma 5 driver-adapter tests

This skill teaches the four non-obvious gotchas of combining `@prisma/adapter-pg` with `@electric-sql/pglite` to get an in-process, Docker-free Postgres test database for a Prisma 5+ project. The codified shim and factory ship as the public package `@kacific/pglite-prisma-adapter` ([GitHub](https://github.com/Kacific/PgLite-Prisma-Adapter)).

## When to use this approach

Reach for PgLite-for-tests when:
- You want a real Postgres SQL parser and execution semantics in tests
- You want zero Docker and zero local Postgres install
- You're tired of SQLite-as-Postgres-substitute divergences
- Your tests don't depend on Postgres-specific concurrency primitives (advisory locks, listen/notify, `SKIP LOCKED`)
- Your tests don't depend on extensions PGlite doesn't bundle (PostGIS, etc.)

Reach for real Postgres (testcontainers, or a nightly CI matrix) when ANY of those caveats bite. A common pattern: PgLite in PR-time CI (fast, parallel-friendly), real Postgres nightly (slower, catches divergence).

## Adoption: five lines of code

```bash
pnpm add -D @kacific/pglite-prisma-adapter @prisma/adapter-pg @electric-sql/pglite pg
```

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}
```

```bash
# Cache the schema as raw CREATE statements (regenerate when schema changes)
DATABASE_URL="postgresql://stub" prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > test/sql/postgres-bootstrap.sql
```

```typescript
// test/db.ts or similar
import { readFileSync } from 'node:fs';
import { createPgLitePrisma } from '@kacific/pglite-prisma-adapter';

const bootstrapSql = readFileSync('./test/sql/postgres-bootstrap.sql', 'utf8');

export const newTestDb = () => createPgLitePrisma({ bootstrapSql });
```

```typescript
// Any test file
const handle = await newTestDb();
try {
  // ... handle.prisma.* ...
} finally {
  await handle.close();
}
```

## The four gotchas (the part you teach the user)

If the user is hitting one of these, name the gotcha by number and apply the fix. The package's source files embed the rationale inline; this section is the "what's actually happening" summary.

### Gotcha 1: `instanceof Pool` — extend, don't compose

**Error:** `Error: PrismaPg must be initialized with an instance of Pool`

**Cause:** `@prisma/adapter-pg`'s `PrismaPg` constructor does an `instanceof Pool` check. A composition-shaped shim (an object with `.query`, `.connect`, `.end` methods) fails this guard.

**Fix:** the shim must `extends Pool`. Pass empty options to the super constructor; override every method that would open a real connection so the underlying `pg.Pool` never gets a chance to.

### Gotcha 2: The adapter calls the config-object form of `query()`

**Error:** `TypeError [ERR_INVALID_ARG_TYPE]: The "string" argument must be of type string. Received an instance of Object`

**Cause:** Documentation examples show `pool.query(text, values)`. The adapter actually uses the pg-shaped config-object form: `client.query({ text, values, rowMode: 'array', types: { getTypeParser } })`. A shim that only handles `(text, values)` receives the config object where it expected a SQL string.

**Fix:** detect whether the first argument is a string or a config object. If config: extract `text`, `values`, `rowMode`, `types`. Pass `rowMode` and the materialised parsers record through to PGlite's native `QueryOptions`.

### Gotcha 3: `types.getTypeParser` cannot be wrapped in a Proxy

**Error:** `PrismaClientKnownRequestError: Inconsistent column data: Conversion failed: expected a string in column 'occurredAt', found {}`

**Cause:** The adapter's `types` field is `{ getTypeParser: (oid, format) => parserFn }`. PGlite's `parsers` option wants a concrete record: `Record<oid, parserFn>`. The intuitive bridge is a Proxy:

```typescript
// THIS DOES NOT WORK
const parsers = new Proxy({}, {
  get: (_, oid) => types.getTypeParser(Number(oid), 'text')
});
```

PGlite enumerates `Object.keys(parsers)` to install them. `Object.keys` does not trigger Proxy's `get` trap; it returns enumerable own keys, which a Proxy with only `get` doesn't have. TIMESTAMP / TIMESTAMPTZ / JSONB silently return native types instead of strings, and Prisma's deserialiser fails downstream.

**Fix:** build the parsers record concretely at construction. Walk `pg.types.builtins` (the numeric enum mapping type names to oids), ask the adapter's shim for each oid's text parser, store in a plain object. Add a small explicit list of array-type oids that `builtins` does not enumerate (1561, 1563, 143, 1115, 1182, 1183, 1231, 791, 1001).

Verification trick if you suspect this: add a `console.log` inside the Proxy's `get` trap and re-run. If the log never fires, the Proxy isn't being read — confirmed.

### Gotcha 4: Version pinning — match `@prisma/adapter-pg` to your `@prisma/client`

**Error:** confusing engine-version mismatch errors at runtime.

**Cause:** `@prisma/adapter-pg` follows Prisma's major version bumps. `@prisma/adapter-pg@7.x` (latest as of 2026-05) is for Prisma 7. With Prisma 5.x or 6.x, installing the latest adapter throws.

**Fix:** pin `@prisma/adapter-pg` to the matching major.minor of your `@prisma/client` (e.g. `5.22.0` for client `5.22.0`).

## Common follow-up questions

**"Why not just use testcontainers?" / "Why not Docker Postgres?"**
PGlite is faster (in-process, no container spin-up), simpler (zero infra), and works in environments where Docker isn't available (CI, restricted devboxes, some corporate networks). The trade-off is the concurrency caveat above; pair with nightly real-Postgres CI for production confidence.

**"Will the schema stay in sync?"**
The bootstrap SQL is regenerated from the live schema, so the test schema is always definitionally correct. The risk is a stale bootstrap.sql committed alongside a newer schema.prisma. Mitigate with a CI lint: re-run `prisma migrate diff` in CI and `diff` it against the committed SQL; fail the build if they differ.

**"What about migrations?"**
PGlite doesn't run migrations; the bootstrap SQL is the squashed final state. If you need to test a migration's effect specifically, run it against a real Postgres in a dedicated CI job. For most "does my code work against my current schema" tests, the squashed bootstrap is the right shape.

**"Multiple workers slow / hang my test suite."**
PGlite is single-process. Test runners that fan parallel workers all running the full suite (`turbo run test` across many packages, each with `vitest --root ../..`) cause N×M PGlite instances and resource contention. Use a single test process at the repo root, or scope each package's test config to its own files.

## Boundaries

- This skill is about the test-DB setup. It is NOT about production database choices, Prisma migrations strategy, or general Postgres tuning.
- The skill assumes Prisma 5.10+ (driver-adapter support arrived here). For Prisma 4 and earlier, the driver-adapter pattern doesn't exist; PGlite-for-tests isn't directly applicable.

## Source

- Public package: [@kacific/pglite-prisma-adapter](https://github.com/Kacific/PgLite-Prisma-Adapter)
- The package's two source files embed the rationale inline:
  - `src/pglite-as-pg-pool.ts` — the pg.Pool shim
  - `src/prisma-pglite-factory.ts` — the PrismaClient factory
