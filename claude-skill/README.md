# Claude Code skill: pglite-prisma-tests

A [Claude Code](https://claude.com/claude-code) skill that teaches Claude when and how to use `@kacific/pglite-prisma-adapter` for in-process Postgres test databases, including the four common gotchas the package codifies.

## What this skill does

When Claude detects you're:
- Setting up a Prisma 5+ test database
- Debugging `instanceof Pool` errors from `@prisma/adapter-pg`
- Debugging `ERR_INVALID_ARG_TYPE` errors from PGlite
- Debugging `Conversion failed: expected a string in column ...` errors
- Asking about Docker-free Postgres in tests
- Migrating away from `prisma db push --force-reset` against SQLite

...this skill fires and supplies the four-gotcha rundown, the five-line adoption snippet, and the boundaries (when to reach for real Postgres instead).

## Install

Drop `SKILL.md` (or a symlink to it) into your Claude Code skills folder.

### Personal (single user, all projects)

```bash
mkdir -p ~/.claude/skills/pglite-prisma-tests
curl -fsSL https://raw.githubusercontent.com/Kacific/PgLite-Prisma-Adapter/main/claude-skill/SKILL.md \
  -o ~/.claude/skills/pglite-prisma-tests/SKILL.md
```

### Project-scoped (commit to your repo)

```bash
mkdir -p .claude/skills/pglite-prisma-tests
curl -fsSL https://raw.githubusercontent.com/Kacific/PgLite-Prisma-Adapter/main/claude-skill/SKILL.md \
  -o .claude/skills/pglite-prisma-tests/SKILL.md
git add .claude/skills/pglite-prisma-tests/SKILL.md
```

### Or just clone the whole repo as a vault entry

If you maintain a personal skills vault (`~/Documents/Skills-Vault` symlinked to `~/.claude/skills/`, etc.), add this repo as a submodule or vendor copy and Claude will pick it up.

## Verify the skill loaded

In a Claude Code session, ask: "How do I set up an in-process Postgres database for my Prisma tests?"

If the skill is loaded, Claude will reference `@kacific/pglite-prisma-adapter` and the four gotchas. If it doesn't, check that `SKILL.md`'s frontmatter (`name:` and `description:`) is intact and the file is in a path Claude scans.

## Updating

Skills are static markdown. To update:

```bash
curl -fsSL https://raw.githubusercontent.com/Kacific/PgLite-Prisma-Adapter/main/claude-skill/SKILL.md \
  -o ~/.claude/skills/pglite-prisma-tests/SKILL.md
```

Or `git pull` if you cloned the repo.

## See also

- The package: [@kacific/pglite-prisma-adapter](https://github.com/Kacific/PgLite-Prisma-Adapter)
- The package's README, which mirrors the skill's content for human readers
