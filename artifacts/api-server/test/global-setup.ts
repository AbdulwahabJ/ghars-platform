import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const TEST_DB_NAME = "dental_followup_test";

/**
 * Provision a disposable test database on the same cluster as the dev
 * database and bring its schema up via the versioned Drizzle migrations —
 * the same migrations used for real environments. The dev database is
 * never touched.
 */
export default async function globalSetup(): Promise<void> {
  const adminUrl =
    process.env.TEST_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error("DATABASE_URL must be set to provision the test database.");
  }
  const parsed = new URL(adminUrl);
  if (parsed.pathname === `/${TEST_DB_NAME}`) {
    throw new Error(
      "Admin connection must not point at the test database itself.",
    );
  }

  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
  await client.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await client.end();

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${TEST_DB_NAME}`;
  const pool = new pg.Pool({ connectionString: testUrl.toString() });
  const dir = path.dirname(fileURLToPath(import.meta.url));
  await migrate(drizzle(pool), {
    migrationsFolder: path.resolve(dir, "../../../lib/db/migrations"),
  });
  await pool.end();
}
