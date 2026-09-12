import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lifecycle = vi.hoisted(() => ({
  tenant: null as null | Record<string, unknown>,
  listeners: new Set<() => void>(),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("@/i18n/LocaleProvider", () => ({
  useLocale: () => ({
    locale: "en",
    direction: "ltr",
    changeLocale: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-platform-admin", async () => {
  const ReactModule = await import("react");

  const notify = () => {
    for (const listener of lifecycle.listeners) listener();
  };
  const patchTenant = (patch: Record<string, unknown>) => {
    lifecycle.tenant = { ...lifecycle.tenant, ...patch };
    notify();
  };
  const useTenantSnapshot = () =>
    ReactModule.useSyncExternalStore(
      (listener) => {
        lifecycle.listeners.add(listener);
        return () => lifecycle.listeners.delete(listener);
      },
      () => lifecycle.tenant,
      () => lifecycle.tenant,
    );
  const mutation = (run?: () => void) => () => ({
    isPending: false,
    isError: false,
    error: null,
    data: null,
    reset: vi.fn(),
    mutate: (_input: unknown, options?: { onSuccess?: () => void }) => {
      run?.();
      options?.onSuccess?.();
    },
  });

  return {
    usePlatformTenants: () => ({ data: { items: [] }, isLoading: false }),
    usePlatformTenant: () => ({
      data: { tenant: useTenantSnapshot() },
      isLoading: false,
    }),
    usePlatformActivateTenant: mutation(() =>
      patchTenant({
        status: "ACTIVE",
        activatedAt: "2026-08-25T10:00:00.000Z",
      }),
    ),
    usePlatformSuspendTenant: mutation(() =>
      patchTenant({
        status: "SUSPENDED",
        suspendedAt: "2026-08-26T10:00:00.000Z",
      }),
    ),
    usePlatformReactivateTenant: mutation(() =>
      patchTenant({
        status: "ACTIVE",
        suspendedAt: null,
      }),
    ),
    usePlatformExtendTrial: mutation(),
    usePlatformResolveActivationRequest: mutation(),
    usePlatformResetTenantAdminPassword: mutation(),
  };
});

import { TenantDetail } from "@/pages/platform-admin/Customers";

describe("permanent license customer detail", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    lifecycle.tenant = {
      id: "11111111-1111-4111-8111-111111111111",
      referenceCode: "GH-TEST",
      name: "Permanent License Clinic",
      legalName: null,
      contactName: "Owner",
      contactEmail: null,
      contactPhone: "966551234567",
      city: "Riyadh",
      locale: "en",
      isInternal: false,
      status: "TRIAL",
      trialStartedAt: "2026-08-20T10:00:00.000Z",
      trialEndsAt: "2026-08-23T10:00:00.000Z",
      activatedAt: null,
      suspendedAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
      lastActivityAt: null,
      userCount: 0,
      activationRequestCount: 0,
      users: [],
      activationRequests: [],
    };
    lifecycle.listeners.clear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    root.render(<TenantDetail id={String(lifecycle.tenant.id)} onBack={() => undefined} />);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    vi.restoreAllMocks();
  });

  it("keeps activation permanent through suspension and reactivation", async () => {
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Trial");
      expect(document.body.textContent).toContain("Extend Trial");
    });

    clickButton("Activate");
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Active — Permanently Activated");
      expect(document.body.textContent).toContain("Previous Trial Period");
      expect(document.body.textContent).toContain("Suspend");
      expect(document.body.textContent).not.toContain("Extend Trial");
    });

    clickButton("Suspend");
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Suspended");
      expect(document.body.textContent).toContain("Reactivate");
      expect(document.body.textContent).not.toContain("Extend Trial");
    });

    clickButton("Reactivate");
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Active — Permanently Activated");
      expect(document.body.textContent).toContain("Suspend");
      expect(document.body.textContent).not.toContain("Extend Trial");
    });

    expect(lifecycle.tenant?.activatedAt).toBe("2026-08-25T10:00:00.000Z");
    expect(lifecycle.tenant?.trialEndsAt).toBe("2026-08-23T10:00:00.000Z");
  });
});

function clickButton(label: string) {
  const button = [...document.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  expect(button, `Expected ${label} button`).toBeTruthy();
  button?.click();
}