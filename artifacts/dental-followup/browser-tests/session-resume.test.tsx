import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionLifecycle } from "@/components/auth/SessionLifecycle";
import { ImpersonationLifecycleHandler } from "@/components/ImpersonationLifecycleHandler";
import { api, ApiError } from "@/lib/api";
import { useNotifications } from "@/hooks/use-followups";
import {
  isSessionExpired,
  markSessionAuthenticated,
  resetSessionExpiry,
} from "@/lib/session-expiry";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard", navigate],
}));

describe("session resume", () => {
  let host: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    document.documentElement.lang = "en";
    resetSessionExpiry();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: (failures, error) => !(error instanceof ApiError && error.status === 401) && failures < 3,
          refetchOnWindowFocus: false,
        },
      },
    });
    navigate.mockClear();
  });

  afterEach(() => {
    root.unmount();
    host.remove();
    queryClient.clear();
    resetSessionExpiry();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const render = (children: React.ReactNode = <p>Patient chart</p>) => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <SessionLifecycle>{children}</SessionLifecycle>
      </QueryClientProvider>,
    );
  };

  it("replaces protected content and clears cached patient data after a real 401", async () => {
    queryClient.setQueryData(["me"], { user: { id: "test-user" } });
    queryClient.setQueryData(["patient", "one"], { name: "Private record" });
    markSessionAuthenticated();
    render();
    await vi.waitFor(() => expect(host.textContent).toContain("Patient chart"));

    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ code: "UNAUTHENTICATED", error: "Session ended" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.me()).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });

    await vi.waitFor(() => {
      expect(host.textContent).toContain("Session expired");
      expect(host.textContent).not.toContain("Patient chart");
      expect(queryClient.getQueryData(["patient", "one"])).toBeUndefined();
      expect(queryClient.getQueryData(["me"])).toBeUndefined();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    host.querySelector("button")?.click();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login");
      expect(isSessionExpired()).toBe(false);
    });
  });

  it("checks only once on focus after inactivity, then refreshes active data", async () => {
    queryClient.setQueryData(["me"], { user: { id: "test-user" } });
    markSessionAuthenticated();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
    const fetchMock = vi.fn(async () => Response.json({ user: { id: "test-user" } }));
    vi.stubGlobal("fetch", fetchMock);
    render();
    await vi.waitFor(() => expect(host.textContent).toContain("Patient chart"));

    const currentTime = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(currentTime + 61_000);
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledTimes(1);
    });
    expect(host.textContent).toContain("Patient chart");
    expect(isSessionExpired()).toBe(false);
  });

  it("stops notification polling without retrying when the background request gets 401", async () => {
    queryClient.setQueryData(["me"], { user: { id: "test-user" } });
    queryClient.setQueryData(["patient", "one"], { name: "Private record" });
    markSessionAuthenticated();
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ code: "UNAUTHENTICATED", error: "Session ended" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    function ProtectedPage() {
      useNotifications();
      return <p>Patient chart</p>;
    }
    root.render(
      <QueryClientProvider client={queryClient}>
        <SessionLifecycle><ProtectedPage /></SessionLifecycle>
      </QueryClientProvider>,
    );

    await vi.waitFor(() => expect(host.textContent).toContain("Session expired"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/notifications");
    expect(queryClient.getQueryData(["patient", "one"])).toBeUndefined();
  });

  it("does not mistake a server error for an expired session", async () => {
    queryClient.setQueryData(["me"], { user: { id: "test-user" } });
    markSessionAuthenticated();
    render();
    await vi.waitFor(() => expect(host.textContent).toContain("Patient chart"));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ code: "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )));

    await expect(api.me()).rejects.toMatchObject({ status: 500 });
    expect(host.textContent).toContain("Patient chart");
    expect(isSessionExpired()).toBe(false);
  });

  it("keeps the restored original admin session when impersonation is terminated", async () => {
    queryClient.setQueryData(["me"], { user: { id: "impersonated-user" } });
    markSessionAuthenticated();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ code: "IMPERSONATION_TERMINATED", restoredOriginalAdmin: true }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ))
      .mockResolvedValueOnce(Response.json({ user: { id: "original-admin" } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<><ImpersonationLifecycleHandler /><p>Patient chart</p></>);
    await vi.waitFor(() => expect(host.textContent).toContain("Patient chart"));

    await expect(api.me()).rejects.toMatchObject({ status: 401, code: "IMPERSONATION_TERMINATED" });
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(queryClient.getQueryData(["me"])).toMatchObject({ user: { id: "original-admin" } });
      expect(navigate).toHaveBeenCalledWith("/platform-admin/customers", { replace: true });
    });
    expect(isSessionExpired()).toBe(false);
  });

  it("ignores an old session's late 401 after a successful new sign-in", async () => {
    queryClient.setQueryData(["me"], { user: { id: "old-user" } });
    markSessionAuthenticated();
    let respond!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { respond = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const oldRequest = api.me();

    resetSessionExpiry(); // Login success advances the session generation.
    markSessionAuthenticated();
    queryClient.setQueryData(["me"], { user: { id: "new-user" } });
    queryClient.setQueryData(["patient", "new"], { name: "New user's record" });
    respond(new Response(
      JSON.stringify({ code: "UNAUTHENTICATED" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    ));
    await expect(oldRequest).rejects.toMatchObject({ status: 401 });

    expect(isSessionExpired()).toBe(false);
    expect(queryClient.getQueryData(["me"])).toMatchObject({ user: { id: "new-user" } });
    expect(queryClient.getQueryData(["patient", "new"])).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("removes protected content when another tab ends the session", async () => {
    queryClient.setQueryData(["me"], { user: { id: "test-user" } });
    queryClient.setQueryData(["patient", "one"], { name: "Private record" });
    markSessionAuthenticated();
    render();
    await vi.waitFor(() => expect(host.textContent).toContain("Patient chart"));

    window.dispatchEvent(new StorageEvent("storage", {
      key: "ghars:session-ended",
      newValue: "another-tab",
    }));
    await vi.waitFor(() => {
      expect(host.textContent).toContain("Session expired");
      expect(queryClient.getQueryData(["patient", "one"])).toBeUndefined();
    });
  });
});