import { describe, expect, it, vi } from "vitest";

import {
  inspectSchemaHealth,
  type SchemaQueryExecutor,
} from "../src/lib/schema-health";

const currentFingerprint = {
  table_count: 30,
  tables_signature: "f5ed5e81717db6db8c4e880d2b5ca67e",
  column_count: 327,
  columns_signature: "cbfb2fdc81a5ca376beb81ea2ca15f55",
  constraint_count: 125,
  constraints_signature: "4d86887a47f44c160a2bc04637d9c061",
  index_count: 106,
  indexes_signature: "9a2d08a0a853ba3a8d0883599997593e",
};

const currentJournal = {
  migration_count: 26,
  latest_hash: "9848a52b6425274db1f4954faf04fdacee07d0f9088599d236ff42651c953e7b",
  latest_created_at: "1789481032596",
};

function executorWith(
  ...results: Array<Array<Record<string, unknown>> | Error>
): SchemaQueryExecutor {
  const execute = vi.fn();
  for (const result of results) {
    if (result instanceof Error) {
      execute.mockRejectedValueOnce(result);
    } else {
      execute.mockResolvedValueOnce({ rows: result });
    }
  }
  return execute;
}

function postgresError(code: string, wrapped = false): Error {
  const driverError = Object.assign(new Error(`PostgreSQL ${code}`), { code });
  return wrapped
    ? Object.assign(new Error("Drizzle query failed"), { cause: driverError })
    : driverError;
}

describe("inspectSchemaHealth", () => {
  it("reports a current schema with a readable current journal", async () => {
    const result = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      [currentJournal],
    ));

    expect(result).toEqual({
      status: "healthy",
      messageCode: "schemaCurrentJournalReadable",
      value: 26,
    });
  });

  it("keeps a current schema healthy when Replit did not create a Drizzle journal", async () => {
    const result = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      postgresError("42P01", true),
    ));

    expect(result).toEqual({
      status: "healthy",
      messageCode: "schemaCurrentJournalUnavailable",
    });
  });

  it("recognizes a missing Drizzle schema as an absent journal", async () => {
    const result = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      postgresError("3F000"),
    ));

    expect(result).toEqual({
      status: "healthy",
      messageCode: "schemaCurrentJournalUnavailable",
    });
  });

  it("reports actual schema drift before consulting the journal", async () => {
    const execute = executorWith([{ ...currentFingerprint, column_count: 321 }]);
    const result = await inspectSchemaHealth(execute);

    expect(result).toEqual({
      status: "warning",
      messageCode: "schemaDriftDetected",
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a readable but stale journal from schema drift", async () => {
    const result = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      [{ ...currentJournal, migration_count: 24 }],
    ));

    expect(result).toEqual({
      status: "warning",
      messageCode: "schemaCurrentJournalMismatch",
      value: 24,
    });
  });

  it("reports when schema details cannot be inspected", async () => {
    const result = await inspectSchemaHealth(executorWith(
      new Error("permission denied"),
    ));

    expect(result).toEqual({
      status: "warning",
      messageCode: "schemaInspectionUnavailable",
    });
  });

  it("reports a connection lost before the fingerprint completes as unavailable", async () => {
    const result = await inspectSchemaHealth(executorWith(
      postgresError("08006", true),
    ));

    expect(result).toEqual({
      status: "unavailable",
      messageCode: "schemaDatabaseUnavailable",
    });
  });

  it("does not report permission or timeout failures as healthy", async () => {
    const permissionResult = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      postgresError("42501", true),
    ));
    const timeoutResult = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      postgresError("57014"),
    ));

    expect(permissionResult).toEqual({
      status: "warning",
      messageCode: "schemaJournalInspectionUnavailable",
    });
    expect(timeoutResult).toEqual({
      status: "warning",
      messageCode: "schemaJournalInspectionUnavailable",
    });
  });

  it("reports a lost database connection as unavailable", async () => {
    const result = await inspectSchemaHealth(executorWith(
      [currentFingerprint],
      postgresError("08006", true),
    ));

    expect(result).toEqual({
      status: "unavailable",
      messageCode: "schemaDatabaseUnavailable",
    });
  });
});