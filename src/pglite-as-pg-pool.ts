// Thin shim that makes an @electric-sql/pglite PGlite instance look enough
// like a node-postgres Pool / PoolClient for @prisma/adapter-pg to consume.
//
// Background: Prisma 5.10+ ships a driver-adapter pattern (still under the
// `driverAdapters` preview flag in 5.22). @prisma/adapter-pg wraps a real
// pg.Pool and does an `instanceof Pool` check at construction; the shim
// therefore extends `pg.Pool` so it passes the instanceof guard, then
// overrides the methods the adapter actually calls (`query`, `connect`,
// `end`) to route to the in-process PGlite instance instead of a real
// Postgres backend.
//
// One PGlite instance per shim. Transactions go through PGlite's own
// transaction machinery via the BEGIN / COMMIT / ROLLBACK SQL the adapter
// emits (PGlite supports these on a single connection).

import { Pool, types as pgTypes, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { PGlite, Results, QueryOptions as PgLiteQueryOptions } from '@electric-sql/pglite';

interface PgTypesParserShim {
  readonly getTypeParser: (oid: number, format?: 'text' | 'binary') => (value: string) => unknown;
}

interface PgQueryConfig {
  readonly text: string;
  readonly values?: ReadonlyArray<unknown> | undefined;
  readonly rowMode?: 'array' | undefined;
  readonly name?: string | undefined;
  readonly types?: PgTypesParserShim | undefined;
}

const mapResult = <T extends QueryResultRow = QueryResultRow>(
  sql: string,
  results: Results<unknown>,
): QueryResult<T> => {
  // PGlite returns: { rows, fields, affectedRows, ... }. Translate to
  // pg.QueryResult shape that @prisma/adapter-pg expects.
  const command = sql.trim().split(/\s+/, 1)[0]?.toUpperCase() ?? '';
  const rows = (results.rows ?? []) as T[];
  const affectedRows = (results as { affectedRows?: number }).affectedRows ?? 0;
  const fields = (results.fields ?? []) as QueryResult<T>['fields'];
  return {
    command,
    rowCount: ['SELECT', 'WITH'].includes(command) ? rows.length : affectedRows,
    oid: 0,
    rows,
    fields,
  };
};

// Both the pool and the client expose `query()`. @prisma/adapter-pg passes
// either a plain SQL string OR a config object shaped like pg's QueryConfig:
//   client.query({ text, values, rowMode: 'array', types: { getTypeParser } })
// Translate the pg-shaped config into PGlite's native query options:
//   * rowMode flows through unchanged
//   * `types.getTypeParser` is materialised into a concrete `parsers`
//     record. PGlite enumerates `Object.keys(parsers)` to install them;
//     a Proxy-backed record gets skipped silently (verified empirically
//     against PGlite 0.4.5). Pre-compute the parser for every oid in
//     `pg.types.builtins` + the small set of array oids the adapter cares
//     about. This is what makes TIMESTAMP / TIMESTAMPTZ / JSONB / etc.
//     come back as the string-shaped values Prisma's deserialiser expects
//     (without this, PGlite returns native Date / object types and Prisma
//     fails with "Conversion failed: expected a string in column ...").

// Array-type oids the adapter's customParsers map covers but pg.types
// builtins doesn't enumerate. Kept here so the parsers record has a
// resolver for any column the schema might produce.
const ARRAY_OIDS = [
  1561, // BIT_ARRAY
  1563, // VARBIT_ARRAY
  143,  // XML_ARRAY
  1115, // TIMESTAMP_ARRAY
  1182, // DATE_ARRAY
  1183, // TIME_ARRAY
  1231, // NUMERIC_ARRAY
  791,  // MONEY_ARRAY
  1001, // BYTEA_ARRAY
];

const buildPgLiteParsers = (
  shim: PgTypesParserShim | undefined,
): Record<number, (value: string) => unknown> | undefined => {
  if (shim === undefined) return undefined;
  const parsers: Record<number, (value: string) => unknown> = {};
  // pg.types.builtins is a numeric enum (string -> oid). Walk it and ask
  // the adapter's shim for each oid's text parser. The shim returns the
  // adapter's customParsers entry if defined, else pg-types' default.
  for (const oid of Object.values(pgTypes.builtins)) {
    if (typeof oid !== 'number') continue;
    parsers[oid] = shim.getTypeParser(oid, 'text');
  }
  for (const oid of ARRAY_OIDS) {
    parsers[oid] = shim.getTypeParser(oid, 'text');
  }
  return parsers;
};

const runQueryAgainstPgLite = async <T extends QueryResultRow = QueryResultRow>(
  db: PGlite,
  textOrConfig: string | PgQueryConfig,
  valuesArg?: ReadonlyArray<unknown>,
): Promise<QueryResult<T>> => {
  const config: PgQueryConfig =
    typeof textOrConfig === 'string'
      ? { text: textOrConfig, values: valuesArg }
      : textOrConfig;
  const opts: PgLiteQueryOptions = {};
  if (config.rowMode !== undefined) opts.rowMode = config.rowMode;
  const parsers = buildPgLiteParsers(config.types);
  if (parsers !== undefined) opts.parsers = parsers;
  const values = config.values ?? valuesArg;
  const results = await db.query(config.text, values ? [...values] : undefined, opts);
  return mapResult<T>(config.text, results);
};

// PGlite-backed substitute for a pg.PoolClient. The adapter calls
// client.query() + client.release(); nothing else.
class PgLiteAsPgPoolClient {
  constructor(private readonly db: PGlite) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    textOrConfig: string | PgQueryConfig,
    values?: ReadonlyArray<unknown>,
  ): Promise<QueryResult<T>> {
    return runQueryAgainstPgLite<T>(this.db, textOrConfig, values);
  }

  release(): void {
    // PGlite is a single-connection in-process DB; nothing to release.
  }
}

// Extends pg.Pool so `instanceof Pool` passes inside @prisma/adapter-pg.
// Pass empty options to the super constructor and immediately override
// every method the adapter calls; the underlying pg.Pool never opens a
// real connection because we never let it.
//
// `// @ts-expect-error` on the overrides: pg.Pool's `query` has seven
// overload signatures (callback-style, Submittable, QueryArrayConfig,
// QueryConfig, plus stream and shorthand forms). The adapter only uses
// the two-arg `(text, values)` and the one-arg-config form, both of
// which this implementation handles. Re-asserting all seven overloads
// would be substantial noise for no runtime benefit. The TS error is on
// the override declaration; runtime behaviour is identical to a normal
// override.
export class PgLiteAsPgPool extends Pool {
  constructor(private readonly db: PGlite) {
    super();
  }

  // @ts-expect-error pg.Pool has multiple query overloads; we only support the two the adapter uses
  override async query<T extends QueryResultRow = QueryResultRow>(
    textOrConfig: string | PgQueryConfig,
    values?: ReadonlyArray<unknown>,
  ): Promise<QueryResult<T>> {
    return runQueryAgainstPgLite<T>(this.db, textOrConfig, values);
  }

  override async connect(): Promise<PoolClient> {
    return new PgLiteAsPgPoolClient(this.db) as unknown as PoolClient;
  }

  override async end(): Promise<void> {
    await this.db.close();
  }
}

export const wrapPgLiteAsPgPool = (db: PGlite): PgLiteAsPgPool => new PgLiteAsPgPool(db);
