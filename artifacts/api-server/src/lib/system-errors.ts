import { randomBytes } from "node:crypto";
import { db, systemErrorsTable } from "@workspace/db";
import type { Request } from "express";
import { logger } from "./logger";

interface ClientSystemError {
  route: string;
  errorName: string;
  errorMessage: string;
  componentStack?: string;
  buildVersion: string;
  occurredAt: string;
}

export async function recordSystemError(req: Request, error: unknown) {
  const referenceCode = `GH-ERR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const errorType = error instanceof Error ? error.name : "UnknownError";
  try {
    await db.insert(systemErrorsTable).values({
      referenceCode,
      tenantId: req.currentTenant?.id ?? null,
      userId: req.currentUser?.id ?? null,
      route: req.originalUrl.split("?")[0] ?? req.path,
      method: req.method,
      errorType: errorType.slice(0, 120),
      safeMessage: "حدث خطأ غير متوقع في الخادم.",
      environment: process.env.NODE_ENV ?? "development",
      applicationVersion: process.env.APP_VERSION ?? "development",
    });
  } catch (recordingError) {
    logger.error({ err: recordingError }, "failed to record system error");
  }
  return referenceCode;
}

export async function recordClientSystemError(
  req: Request,
  error: ClientSystemError,
) {
  const referenceCode = `GH-ERR-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

  req.log?.error(
    {
      clientError: {
        route: error.route.split("?")[0],
        errorName: error.errorName,
        errorMessage: error.errorMessage,
        componentStack: error.componentStack,
        buildVersion: error.buildVersion,
        occurredAt: error.occurredAt,
      },
    },
    "client route render failed",
  );

  try {
    await db.insert(systemErrorsTable).values({
      referenceCode,
      tenantId: req.currentTenant?.id ?? null,
      userId: req.currentUser?.id ?? null,
      route: error.route.split("?")[0] || "/",
      method: "CLIENT",
      errorType: error.errorName.slice(0, 120),
      safeMessage: "حدث خطأ غير متوقع في واجهة التطبيق.",
      environment: process.env.NODE_ENV ?? "development",
      applicationVersion: error.buildVersion,
    });
  } catch (recordingError) {
    logger.error({ err: recordingError }, "failed to record client system error");
  }

  return referenceCode;
}