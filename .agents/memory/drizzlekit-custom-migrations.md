---
name: drizzle-kit --custom path bug
description: How to generate migrations safely despite the path bug and detect migration-history drift
---

# drizzle-kit generate fails with absolute-path config

**Rule:** `drizzle-kit generate` — both plain and `--custom` — errors with `ENOENT .//home/...` when the drizzle config uses absolute paths (as this repo's `lib/db/drizzle.config.ts` does). Work around it by copying a temp config with *relative* paths (e.g. to `/tmp/drizzle.rel.config.ts`), running the command from `lib/db` with `--config` pointing at the temp file, then deleting it.

**Why:** drizzle-kit concatenates the CWD with the configured absolute out/schema paths, producing a broken `.//home/...` path.

**How to apply:** For ANY migration generation in this repo (plain `generate` included), use the temp relative config; never edit the journal by hand. Verify afterwards that `meta/_journal.json` gained the new entry.

## Generated SQL when a historical migration lacks a snapshot

**Rule:** If a table was added by an older hand-written migration that has no matching Drizzle snapshot, review newly generated SQL before applying it. Replace a duplicate `CREATE TABLE` with the equivalent safe `ALTER TABLE` for the live schema, while keeping the newly generated snapshot and journal entry for future diffs.

**Why:** Drizzle can see the old snapshots as lacking the table and emit a full table creation even though the database and migration history already contain it. Applying that output would fail immediately and prevents otherwise safe additive changes.

**How to apply:** Generate with the temporary relative config, compare the SQL to the last migration and live table, preserve the generated metadata that establishes the correct new schema baseline, and apply only the additive SQL that the existing table needs.

## Migration-history drift

**Rule:** If `drizzle-kit migrate` stalls while applying an old migration and the matching schema change is already present, inspect `drizzle.__drizzle_migrations` before retrying. Repair its missing entry only after verifying the exact migration has already been applied.

**Why:** A manually applied migration can leave the live schema ahead of Drizzle's database history. The runner then retries the already-applied change and fails before reaching later migrations, often without surfacing PostgreSQL's duplicate-column detail.

**How to apply:** Check the affected table or column and the migration history first. If they agree that only the history row is missing, add that row using the migration's real SHA-256 and journal timestamp, then run the normal migration command. Never use this as a shortcut for an unverified mismatch.
