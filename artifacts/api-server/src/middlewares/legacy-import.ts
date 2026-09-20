import type { NextFunction, Request, Response } from "express";
import { loadPlatformSettings } from "../lib/platform-settings";

/**
 * Global kill switch for all tenant-facing legacy import workflows.
 * Keep this separate from tenant role checks: enabling the feature never
 * grants a user permission to import.
 */
export async function requireLegacyImportEnabled(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  let enabled = false;
  try {
    enabled = (await loadPlatformSettings()).legacyImportEnabled;
  } catch {
    // Fail closed: a settings outage must not accidentally open an importer.
  }
  if (!enabled) {
    res.status(403).json({
      code: "FEATURE_DISABLED",
      error: "هذه الميزة غير متاحة حاليًا.",
    });
    return;
  }
  next();
}