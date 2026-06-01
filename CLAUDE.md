# CLAUDE.md — @kacific/pglite-prisma-adapter

> Canonical project context, operating rules, and contributor conventions. Companion `AGENTS.md` is a pointer to this file.

## Project North Star

The fastest, simplest, Docker-free Prisma test-database story: a tiny, well-documented package that gives a fresh in-process Postgres (PgLite, real PostgreSQL compiled to WASM) per test suite via the Prisma 5 driver-adapter pattern, codifying the non-obvious integration gotchas so adopters spend five lines, not a week. "Done" = a published `@kacific/pglite-prisma-adapter` that consumers adopt with confidence; the bundled `claude-skill/` keeps the integration knowledge current as Prisma / PgLite evolve.

## What this repo is

A TypeScript package: a Prisma 5 driver-adapter over PgLite for in-process Postgres in tests. Ships the `createPgLitePrisma` factory (returns a `PgLitePrismaHandle`), a peer-dependency version matrix, the bootstrap-SQL workflow, and a bundled Claude Code skill at `claude-skill/` (`SKILL.md` + `README.md`). No Docker, no local Postgres, no testcontainers.

## Build / test commands

- `pnpm build` — `tsc -p tsconfig.build.json`
- `pnpm test` — `vitest run`   (`pnpm test:watch` for watch mode)
- `pnpm typecheck` / `pnpm lint` — `tsc --noEmit`
- `prepublishOnly` runs `pnpm build`.

## Conventions specific to this project

- **Peer-dependency alignment is load-bearing.** `@prisma/adapter-pg` must match the consumer's `@prisma/client` major.minor; `@prisma/client` ^5.10 (driver-adapter support landed there), `@electric-sql/pglite` ^0.4, `pg` ^8.13. Keep the README peer-dep matrix in sync with reality.
- **Bootstrap SQL, not migrations.** PgLite does not run Prisma migrations. The schema is cached as raw `CREATE` statements via `prisma migrate diff --from-empty --to-schema-datamodel ... --script`. **Redirect stdout only** when generating it — `2>&1` contaminates the SQL with pnpm/shell warning noise that PgLite then refuses to parse. Regenerate whenever the schema changes.
- **The four gotchas** the package exists to codify live in the README + `claude-skill/SKILL.md`; update both when an edge is found. The skill is the durable home for the integration knowledge — prefer extending it over re-deriving.
- Driver-adapter preview must be enabled in the consumer's `schema.prisma` (`previewFeatures = ["driverAdapters"]`).

## Token loading (`gh`)

Kacific-org repo → `gh_kacific_pat`. `GH_TOKEN` is sourced via direnv from `.envrc` (gitignored), which reads the macOS Keychain entry `gh_kacific_pat`. The canonical pattern (setup, rotation, non-macOS vault variants) lives at [Kacific/Kacific-GitHub-MultiPAT](https://github.com/Kacific/Kacific-GitHub-MultiPAT); this repo carries the slim consumer `.envrc.example`. Fine-grained PAT: Contents R/W, Pull requests R/W, Metadata R, Actions R/W, Issues R/W. `gh pr checks` is not callable from fine-grained PATs; substitute `gh run list` / `gh run view` (Actions: Read).

## Universal operating rules (cross-project)

Universal rules (UTC timestamps, secrets hygiene, multi-PAT direnv, comms style, forward-compatible schemas, token expiry, per-deployment identity, plan-files discipline, pre-park externalisation) live at `~/.claude/CLAUDE.md` + `~/.claude/memory/MEMORY.md`. The four-class re-read at plan-mode entry surfaces them. Project-specific rules live here or in a per-project memory dir at `~/.claude/projects/-Users-sengchye-Documents-Programming-PgLite-Prisma-Adapter/memory/` (currently empty; create on first project-specific note).
