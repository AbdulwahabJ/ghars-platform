import type { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection (defense in depth on top of SameSite=Lax cookies):
 * every state-changing request (POST/PATCH/PUT/DELETE) must carry an Origin
 * or Referer header whose host matches the host the request was served on
 * (X-Forwarded-Host behind the platform proxy, falling back to Host).
 *
 * Requests with neither header (curl, server-to-server) are allowed: they
 * cannot ride a victim's ambient browser cookies, and modern browsers always
 * send Origin on cross-site state-changing requests.
 *
 * Health endpoints are GET-only and therefore exempt by method.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const forwardedHost = req.headers["x-forwarded-host"];
  const expectedHost =
    (typeof forwardedHost === "string"
      ? forwardedHost.split(",")[0]?.trim()
      : undefined) || req.headers.host;

  const matchesExpectedHost = (value: string): boolean => {
    try {
      return new URL(value).host === expectedHost;
    } catch {
      return false;
    }
  };

  const origin = req.headers.origin;
  if (origin) {
    if (matchesExpectedHost(origin)) {
      next();
      return;
    }
    res.status(403).json({
      error: "تعذر التحقق من مصدر الطلب.",
      code: "CSRF_REJECTED",
    });
    return;
  }

  const referer = req.headers.referer;
  if (referer) {
    if (matchesExpectedHost(referer)) {
      next();
      return;
    }
    res.status(403).json({
      error: "تعذر التحقق من مصدر الطلب.",
      code: "CSRF_REJECTED",
    });
    return;
  }

  next();
}
