/**
 * Safety guard: refuse to run the API tests unless DATABASE_URL points at
 * the dedicated disposable test database. This makes it impossible for the
 * suite to truncate or otherwise touch real clinic data.
 */
const url = process.env.DATABASE_URL ?? "";
if (!url.includes("dental_followup_test")) {
  throw new Error(
    "Refusing to run API tests: DATABASE_URL does not point at the dedicated test database.",
  );
}
