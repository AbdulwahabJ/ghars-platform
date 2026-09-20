declare const __APP_BUILD_ID__: string;

export const APP_BUILD_ID =
  typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "development";

const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk [\w-]+ failed/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];
const RECOVERY_KEY_PREFIX = "ghars:chunk-recovery:";

function asError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return new Error(value.message);
  }
  return new Error(String(value));
}

export function isChunkLoadError(value: unknown): boolean {
  const error = asError(value);
  const searchable = `${error.name}: ${error.message}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function chunkRecoveryKey(
  route = window.location.pathname,
  buildId = APP_BUILD_ID,
): string {
  return `${RECOVERY_KEY_PREFIX}${buildId}:${route}`;
}

export function clearChunkRecoveryAttempt(route = window.location.pathname): void {
  try {
    window.sessionStorage.removeItem(chunkRecoveryKey(route));
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
}

export function claimChunkRecoveryAttempt(
  storage: Pick<Storage, "getItem" | "setItem">,
  route = window.location.pathname,
  buildId = APP_BUILD_ID,
): boolean {
  const key = chunkRecoveryKey(route, buildId);
  if (storage.getItem(key) === "attempted") return false;
  storage.setItem(key, "attempted");
  return true;
}

/**
 * Reload exactly once for a known lazy-chunk failure. A successful route render
 * clears this route/build guard; a persistent failure cannot create a loop.
 */
export function recoverFromChunkLoadError(value: unknown): boolean {
  if (!isChunkLoadError(value)) return false;

  try {
    if (!claimChunkRecoveryAttempt(window.sessionStorage)) return false;
  } catch {
    // Without a durable guard, reloading could loop forever.
    return false;
  }

  window.location.reload();
  return true;
}

function safeErrorMessage(error: Error): string {
  return error.message
    .replace(/https?:\/\/[^/\s]+/gi, "")
    .replace(/\?[^)\s]*/g, "")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      "[redacted-id]",
    )
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\d{5,}/g, "[redacted-number]")
    .replace(/[\u0600-\u06ff][\u0600-\u06ff\s]{2,}/g, "[redacted-text]")
    .slice(0, 500);
}

export function clientErrorMetadata(
  value: unknown,
  componentStack?: string,
) {
  const error = asError(value);
  return {
    route: window.location.pathname,
    errorName: error.name.slice(0, 120),
    errorMessage: safeErrorMessage(error),
    componentStack: componentStack?.slice(0, 4_000),
    buildVersion: APP_BUILD_ID,
    occurredAt: new Date().toISOString(),
  };
}

export function reportClientError(
  value: unknown,
  componentStack?: string,
): void {
  const metadata = clientErrorMetadata(value, componentStack);
  console.error("Route render failed", metadata);

  void fetch(`${import.meta.env.BASE_URL}api/client-errors`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
    keepalive: true,
  }).catch(() => {
    // Diagnostics must never replace or compound the original failure.
  });
}