# Commercial Authentication Release Readiness

**Assessment date:** 2026-08-26  
**Scope:** Username-and-phone commercial onboarding, 72-hour trials, platform/tenant separation, and administrative password recovery.

## Release status

Ready for a stable development checkpoint. This change has **not** been published, and no production database was modified.

## Confirmed behavior

- New customers register with organization name, owner name, username, mobile number, password confirmation, and optional city.
- Email is not required and no email provider configuration is needed to register.
- Tenant creation, owner creation, membership creation, and the 72-hour trial begin atomically.
- Platform Super Admin accounts remain outside tenant memberships and are directed to the platform console.
- Tenant administrators can reset passwords only for non-administrator users in their own tenant.
- Platform Super Admin can reset tenant administrator passwords from tenant details.
- Administrative resets return the temporary password once, revoke existing sessions, and require a private password change before operational access.
- Password resets do not reactivate disabled users or bypass an expired or suspended tenant.
- Users can change their own password by providing the current password.
- Pre-release email-verification and email-reset tables/code remain dormant and are not a release dependency.

## Verification completed

- TypeScript checks passed for the API and web artifacts.
- Production builds passed for the API and web artifacts.
- API test suite passed: **187 tests**.
- Browser verification passed for:
  - registration without email,
  - automatic sign-in and 72-hour trial start,
  - self-service password change,
  - support-based recovery guidance,
  - login with the changed password.
- Development workflows restarted cleanly with no application startup errors.
- Development database migration applied successfully.
- Development Platform Admin `admin` is confirmed to have zero tenant memberships.

## Deferred by design

- Email verification and email-based password recovery are inactive for this release.
- No subscription billing, payment gateway, or license-key system is included.
- Production migration and publication require a separate explicit release action.