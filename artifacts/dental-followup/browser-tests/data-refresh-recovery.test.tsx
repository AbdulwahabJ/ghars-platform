import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import {
  invalidatePatientCreatedViews,
  invalidatePatientRecordViews,
} from "@/lib/query-invalidation";

describe("authoritative data refresh", () => {
  it("refreshes the patient list, dashboard, statistics, and operational report", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidatePatientCreatedViews(queryClient);

    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["patients"],
      ["operational-report"],
      ["dashboard"],
      ["statistics"],
    ]);
  });

  it("refreshes the patient file and derived views after case or implant changes", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue(undefined);

    await invalidatePatientRecordViews(queryClient, "patient-1");

    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual([
      ["patient", "patient-1"],
      ["patient", "patient-1", "implant-cases"],
      ["operational-report"],
      ["dashboard"],
      ["statistics"],
    ]);
  });
});

describe("route error recovery", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.documentElement.lang = "en";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    vi.restoreAllMocks();
  });

  it("shows a retryable localized fallback instead of blanking the page", async () => {
    let shouldThrow = true;
    const onRetry = vi.fn(async () => {
      shouldThrow = false;
    });
    function UnstableSection() {
      if (shouldThrow) throw new Error("temporary render failure");
      return <p>Recovered content</p>;
    }

    root.render(
      <RouteErrorBoundary onRetry={onRetry}>
        <UnstableSection />
      </RouteErrorBoundary>,
    );

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Unable to load this section.");
    });
    const retry = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Retry",
    );
    retry?.click();

    await vi.waitFor(() => {
      expect(onRetry).toHaveBeenCalledOnce();
      expect(document.body.textContent).toContain("Recovered content");
    });
  });
});