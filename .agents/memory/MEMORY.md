# Memory Index

- [Dental spec discipline](dental-spec-discipline.md) — spec file is law: exact Arabic copy, no invented features, phase gates with stop-for-approval; where the binding decisions live.
- [Shared Zod instead of codegen](shared-zod-contract.md) — this project deliberately skips OpenAPI/Orval codegen; API contracts live in lib/shared Zod schemas.
- [driver.js progress quirk](driverjs-progress-quirk.md) — per-step showProgress:false is ignored (|| merge); hide the counter via onPopoverRender DOM hook.
- [Testing-agent evidence rule](tester-evidence-rule.md) — when a tester reports a visual failure, view the screenshot yourself before "fixing"; DOM-text reads and stale pages produce false failures.
- [Browser-translate DOM crash](translate-domcrash.md) — removeChild NotFoundError on "<Text>" = translation mutating text nodes, not an app bug; keep notranslate + span-wrapped swap labels.
- [Authed UI verification](authed-ui-verification.md) — verify login-protected UI via tester workflow env override onto the test DB; hand-rolled background servers die between shell sessions.
- [Drizzle error wrapping](drizzle-error-wrapping.md) — SQLSTATE checks must walk err.cause (DrizzleQueryError); test constraint races with truly parallel requests.
- [drizzle-kit --custom path bug](drizzlekit-custom-migrations.md) — custom SQL migrations fail (ENOENT .//home/…) with the repo's absolute-path config; use a temp relative config.
