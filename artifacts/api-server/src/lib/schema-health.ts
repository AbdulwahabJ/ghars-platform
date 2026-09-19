import { sql, type SQL } from "drizzle-orm";

type SchemaComponent = {
  status: "healthy" | "warning" | "unavailable";
  messageCode: string;
  value?: number;
};

type QueryResult = {
  rows: Array<Record<string, unknown>>;
};

export type SchemaQueryExecutor = (query: SQL) => Promise<QueryResult>;

const EXPECTED_SCHEMA = {
  tableCount: 33,
  tablesSignature: "3ea94766d532d3c80dddc064a4540a72",
  columnCount: 367,
  columnsSignature: "808c97801ffed3333f4a2c7c39619c82",
  constraintCount: 138,
  constraintsSignature: "e0d5ba3f033ef7ca77ef381ed2868b24",
  indexCount: 116,
  indexesSignature: "64ef0d46c9bf818dfea399e5b49414a4",
} as const;

const EXPECTED_MIGRATION_COUNT = 29;
const EXPECTED_LATEST_MIGRATION = {
  hash: "65b72d6cbd79b4ecf12edf4cee326138909c44cad92618d90b4b69d58708f4be",
  createdAt: "1789841000000",
} as const;

export const schemaFingerprintQuery = sql`
  WITH tables AS (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  ),
  columns AS (
    SELECT
      table_name,
      ordinal_position,
      column_name,
      data_type,
      udt_name,
      is_nullable,
      coalesce(column_default, '') AS column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
  ),
  constraints AS (
    SELECT
      relation.relname AS table_name,
      constraint_record.contype::text AS constraint_type,
      pg_get_constraintdef(constraint_record.oid, true) AS definition
    FROM pg_constraint constraint_record
    JOIN pg_class relation ON relation.oid = constraint_record.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
  ),
  indexes AS (
    SELECT tablename AS table_name, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
  )
  SELECT
    (SELECT count(*)::int FROM tables) AS table_count,
    (SELECT md5(string_agg(table_name, '|' ORDER BY table_name)) FROM tables) AS tables_signature,
    (SELECT count(*)::int FROM columns) AS column_count,
    (
      SELECT md5(string_agg(
        table_name || ':' || ordinal_position || ':' || column_name || ':' ||
        data_type || ':' || udt_name || ':' || is_nullable || ':' || column_default,
        '|' ORDER BY table_name, ordinal_position
      ))
      FROM columns
    ) AS columns_signature,
    (SELECT count(*)::int FROM constraints) AS constraint_count,
    (
      SELECT md5(string_agg(
        table_name || ':' || constraint_type || ':' || definition,
        '|' ORDER BY table_name, constraint_type, definition
      ))
      FROM constraints
    ) AS constraints_signature,
    (SELECT count(*)::int FROM indexes) AS index_count,
    (
      SELECT md5(string_agg(
        table_name || ':' || indexname || ':' || indexdef,
        '|' ORDER BY table_name, indexname
      ))
      FROM indexes
    ) AS indexes_signature
`;

export const migrationJournalQuery = sql`
  SELECT
    count(*)::int AS migration_count,
    (array_agg(hash ORDER BY created_at DESC))[1] AS latest_hash,
    max(created_at)::text AS latest_created_at
  FROM drizzle.__drizzle_migrations
`;

function schemaMatches(row: Record<string, unknown> | undefined): boolean {
  if (!row) return false;
  return (
    Number(row.table_count) === EXPECTED_SCHEMA.tableCount
    && row.tables_signature === EXPECTED_SCHEMA.tablesSignature
    && Number(row.column_count) === EXPECTED_SCHEMA.columnCount
    && row.columns_signature === EXPECTED_SCHEMA.columnsSignature
    && Number(row.constraint_count) === EXPECTED_SCHEMA.constraintCount
    && row.constraints_signature === EXPECTED_SCHEMA.constraintsSignature
    && Number(row.index_count) === EXPECTED_SCHEMA.indexCount
    && row.indexes_signature === EXPECTED_SCHEMA.indexesSignature
  );
}

function findSqlState(error: unknown): string | null {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const code = Reflect.get(current, "code");
    if (typeof code === "string") return code;
    current = Reflect.get(current, "cause");
  }
  return null;
}

function isDatabaseConnectionError(sqlState: string | null): boolean {
  return Boolean(
    sqlState?.startsWith("08")
    || ["57P01", "57P02", "57P03"].includes(sqlState ?? ""),
  );
}

export async function inspectSchemaHealth(
  execute: SchemaQueryExecutor,
): Promise<SchemaComponent> {
  let fingerprint: QueryResult;
  try {
    fingerprint = await execute(schemaFingerprintQuery);
  } catch (error) {
    if (isDatabaseConnectionError(findSqlState(error))) {
      return {
        status: "unavailable",
        messageCode: "schemaDatabaseUnavailable",
      };
    }
    return { status: "warning", messageCode: "schemaInspectionUnavailable" };
  }

  if (!schemaMatches(fingerprint.rows[0])) {
    return { status: "warning", messageCode: "schemaDriftDetected" };
  }

  try {
    const journal = await execute(migrationJournalQuery);
    const row = journal.rows[0];
    const migrationCount = Number(row?.migration_count ?? 0);
    const journalCurrent = (
      migrationCount === EXPECTED_MIGRATION_COUNT
      && row?.latest_hash === EXPECTED_LATEST_MIGRATION.hash
      && String(row?.latest_created_at ?? "") === EXPECTED_LATEST_MIGRATION.createdAt
    );

    return journalCurrent
      ? {
          status: "healthy",
          messageCode: "schemaCurrentJournalReadable",
          value: migrationCount,
        }
      : {
          status: "warning",
          messageCode: "schemaCurrentJournalMismatch",
          value: migrationCount,
        };
  } catch (error) {
    const sqlState = findSqlState(error);
    if (sqlState === "42P01" || sqlState === "3F000") {
      return {
        status: "healthy",
        messageCode: "schemaCurrentJournalUnavailable",
      };
    }
    if (isDatabaseConnectionError(sqlState)) {
      return {
        status: "unavailable",
        messageCode: "schemaDatabaseUnavailable",
      };
    }
    return {
      status: "warning",
      messageCode: "schemaJournalInspectionUnavailable",
    };
  }
}