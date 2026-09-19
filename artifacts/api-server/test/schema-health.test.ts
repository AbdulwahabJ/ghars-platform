import { describe, expect, it, vi } from "vitest";

import {
  inspectSchemaHealth,
  type SchemaQueryExecutor,
} from "../src/lib/schema-health";

const currentFingerprint = {
  table_count: 33,
  tables_signature: "3ea94766d532d3c80dddc064a4540a72",
  column_count: 367,
  columns_signature: "808c97801ffed3333f4a2c7c39619c82",
  constraint_count: 138,
  constraints_signature: "e0d5ba3f033ef7ca77ef381ed2868b24",
  index_count: 116,
  indexes_signature: "64ef0d46c9bf818dfea399e5b49414a4",
};

const currentJournal = {
  migration_count: 29,
  latest_hash: "65b72d6cbd79b4ecf12edf4cee326138909c44cad92618d90b4b69d58708f4be",
  latest_created_at: "1789841000000",
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
      value: 29,
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