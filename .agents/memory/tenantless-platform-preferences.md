---
name: Tenantless platform preferences
description: Rules for user preferences and locale synchronization when the authenticated user is a platform administrator without a clinic tenant.
---

Identity-level preferences such as locale must be available to authenticated platform administrators without requiring an operational clinic tenant. Tenant-scoped audit activity should run only when the action is actually tenant-scoped and a tenant context exists.

**Why:** Platform administrators intentionally have no clinic membership. Treating locale updates like clinic onboarding caused authorization failures and a tenant dereference after the preference itself had already saved.

**How to apply:** Mount identity-preference endpoints before tenant-operational guards. Keep clinic onboarding audits conditional on both an onboarding change and tenant context. In the client, synchronize locale from server preferences only when the server preference changes, not whenever local locale state changes, to avoid mutation feedback loops.