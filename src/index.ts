// @kacific/pglite-prisma-adapter — public entry point.
//
// Use `createPgLitePrisma()` (or the simpler `createTestPrisma()`) to get
// a fresh PrismaClient backed by an in-process PGlite instance with your
// schema applied. See the README for the bootstrap SQL pattern and the
// four non-obvious gotchas this package codifies.

export {
  createPgLitePrisma,
  createTestPrisma,
  type PgLitePrismaHandle,
  type CreatePgLitePrismaOptions,
} from './prisma-pglite-factory.js';

export {
  wrapPgLiteAsPgPool,
  PgLiteAsPgPool,
} from './pglite-as-pg-pool.js';
