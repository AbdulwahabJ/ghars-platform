import { beforeEach, describe, expect, it } from "vitest";
import {
  chunkRecoveryKey,
  claimChunkRecoveryAttempt,
  clearChunkRecoveryAttempt,
  clientErrorMetadata,
  isChunkLoadError,
} from "@/lib/runtime-errors";

describe("lazy chunk failure recovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
    history.replaceState({}, "", "/privacy");
  });

  it("recognizes known chunk failures without classifying ordinary errors", () => {
    expect(
      isChunkLoadError(
        new TypeError(
          "Failed to fetch dynamically imported module: https://example.test/assets/Privacy-old.js",
        ),
      ),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 42 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Patient query failed"))).toBe(false);
  });

  it("uses a route-and-build scoped loop guard that successful render clears", () => {
    expect(
      claimChunkRecoveryAttempt(sessionStorage, "/privacy", "build-a"),
    ).toBe(true);
    expect(
      claimChunkRecoveryAttempt(sessionStorage, "/privacy", "build-a"),
    ).toBe(false);
    expect(
      claimChunkRecoveryAttempt(sessionStorage, "/terms", "build-a"),
    ).toBe(true);
    expect(
      claimChunkRecoveryAttempt(sessionStorage, "/privacy", "build-b"),
    ).toBe(true);

    clearChunkRecoveryAttempt("/privacy");
    expect(sessionStorage.getItem(chunkRecoveryKey("/privacy"))).toBeNull();
  });

  it("reports safe chunk metadata and redacts the deployment origin", () => {
    const metadata = clientErrorMetadata(
      new TypeError(
        "Failed to fetch dynamically imported module: https://ghars.example/assets/Privacy-old.js?token=secret",
      ),
      "at Lazy\nat Suspense",
    );

    expect(metadata.route).toBe("/privacy");
    expect(metadata.errorName).toBe("TypeError");
    expect(metadata.errorMessage).toBe(
      "Failed to fetch dynamically imported module: /assets/Privacy-old.js",
    );
    expect(metadata.errorMessage).not.toContain("secret");
    expect(metadata.componentStack).toContain("Suspense");
    expect(metadata.buildVersion).toBeTruthy();
  });

  it("keeps technical messages while redacting likely user data", () => {
    const metadata = clientErrorMetadata(
      new Error(
        "Failed to remove node for المريض أحمد at patient@example.com record 123456",
      ),
    );

    expect(metadata.errorMessage).toContain("Failed to remove node");
    expect(metadata.errorMessage).toContain("[redacted-text]");
    expect(metadata.errorMessage).toContain("[redacted-email]");
    expect(metadata.errorMessage).toContain("[redacted-number]");
    expect(metadata.errorMessage).not.toContain("أحمد");
    expect(metadata.errorMessage).not.toContain("patient@example.com");
  });
});