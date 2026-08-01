---
name: drizzle-kit --custom path bug
description: How to generate custom SQL migrations in this repo without the ENOENT path bug
---

# drizzle-kit generate --custom fails with absolute-path config

**Rule:** `drizzle-kit generate --custom` errors with `ENOENT .//home/...` when the drizzle config uses absolute paths (as this repo's `lib/db/drizzle.config.ts` does). Work around it by copying a temp config with *relative* paths (e.g. to `/tmp/drizzle.rel.config.ts`), running the command from `lib/db` with `--config` pointing at the temp file, then deleting it.

**Why:** drizzle-kit concatenates the CWD with the configured absolute out/schema paths, producing a broken `.//home/...` path. Hit while creating the Phase-2 seed and partial-unique-index migrations.

**How to apply:** Whenever a hand-written SQL migration is needed (seeds, partial indexes, anything `generate` can't infer), use the temp relative config; never edit the journal by hand. Verify afterwards that `meta/_journal.json` gained the new entry.
