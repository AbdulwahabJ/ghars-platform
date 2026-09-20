import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { DEFAULT_PLATFORM_SETTINGS } from "../src/lib/platform-settings";
import { requireLegacyImportEnabled } from "../src/middlewares/legacy-import";
import { loadPlatformSettings } from "../src/lib/platform-settings";

vi.mock("../src/lib/platform-settings", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/platform-settings")>(
    "../src/lib/platform-settings",
  );
  return {
    ...actual,
    loadPlatformSettings: vi.fn(),
  };
});

const load = vi.mocked(loadPlatformSettings);

function response() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(res.status).mockReturnValue(res);
  return res;
}

describe("legacy import feature gate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("defaults disabled in the server loader", () => {
    expect(DEFAULT_PLATFORM_SETTINGS.legacyImportEnabled).toBe(false);
  });

  it("fails closed with the safe feature-disabled response when off", async () => {
    load.mockResolvedValue({ ...DEFAULT_PLATFORM_SETTINGS, legacyImportEnabled: false });
    const res = response();
    const next = vi.fn() as unknown as NextFunction;

    await requireLegacyImportEnabled({} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: "FEATURE_DISABLED",
      error: "هذه الميزة غير متاحة حاليًا.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed with the same response when settings cannot be read", async () => {
    load.mockRejectedValue(new Error("database unavailable"));
    const res = response();
    const next = vi.fn() as unknown as NextFunction;

    await requireLegacyImportEnabled({} as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      code: "FEATURE_DISABLED",
      error: "هذه الميزة غير متاحة حاليًا.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes through to existing role authorization when enabled", async () => {
    load.mockResolvedValue({ ...DEFAULT_PLATFORM_SETTINGS, legacyImportEnabled: true });
    const res = response();
    const next = vi.fn() as unknown as NextFunction;

    await requireLegacyImportEnabled({} as Request, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});