import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    tenantId?: string;
    originalPlatformAdminTenantId?: string;
    originalPlatformAdminId?: string;
    impersonationTargetUserId?: string;
    impersonationTargetTenantId?: string;
    impersonationStartedAt?: string;
    impersonationReason?: string;
  }
}
