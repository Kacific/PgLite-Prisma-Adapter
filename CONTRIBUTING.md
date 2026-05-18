# Contributing

Thank you for considering a contribution.

## Reporting bugs

Open an issue at [github.com/Kacific/PgLite-Prisma-Adapter/issues](https://github.com/Kacific/PgLite-Prisma-Adapter/issues) with:
- The error message (verbatim, with stack trace)
- Versions: `@prisma/client`, `@prisma/adapter-pg`, `@electric-sql/pglite`, `pg`, `node`
- A minimal reproduction (a failing test, a small repo, or a snippet)

Bugs in this package's adapter glue look like silent data-shape mismatches or `instanceof` errors at construction. Bugs in your own test setup look like SQL syntax errors or missing tables. The four gotchas in the README cover the common ones; if you've ruled them out, please open an issue.

## Pull requests

1. Fork and branch.
2. Run `pnpm install`.
3. Make your change. New behaviour should come with a new test in `test/smoke.test.ts` (or a sibling file).
4. Run `pnpm typecheck && pnpm test` and make sure both pass.
5. Open a PR with a clear description of the problem and the fix.

### Code style

- TypeScript with strict mode + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` enabled. The compiler is the style guide.
- Comments only when the **why** is non-obvious. Never narrate the **what**.
- Keep the public API surface tight. Adding a new exported function is a deliberate decision, not a convenience.

### What's in scope

- Bug fixes to the adapter glue
- Compatibility fixes for new versions of `@prisma/adapter-pg`, `@electric-sql/pglite`, or `pg`
- Performance improvements that don't sacrifice safety
- Documentation, especially clarifying the four gotchas

### What's out of scope (and why)

- **Postgres-specific extensions (PostGIS, TimescaleDB, etc.):** these are PGlite limitations; the package can't paper over them. Reach for testcontainers + real Postgres for those scenarios.
- **Mock data factories / seeding utilities:** out of scope for this package. Many good Prisma-mock and seed libraries exist already.
- **A separate API for Jest / Mocha / etc.:** the package is test-runner-agnostic by design. The `createPgLitePrisma()` factory works inside any test framework that supports async setup/teardown.
- **Schema migration helpers:** PGlite-for-tests is intentionally schema-final-state. If you need migration testing, use a real Postgres in a dedicated CI job.

## Versioning

Semver. The driver-adapter API is still flagged as `preview` in Prisma 5.x; this package treats that as 0.x semantics (minor versions may have breaking changes). When Prisma graduates the driver-adapter pattern out of preview, this package will publish 1.0.0.

## Releasing (maintainers)

1. Bump version in `package.json` (semver-compliant).
2. Update `CHANGELOG.md` (TODO: create when the first release ships).
3. `git tag vX.Y.Z && git push --tags`
4. `pnpm publish --access public`

## License

By contributing, you agree your contribution will be licensed under the [MIT License](./LICENSE).
