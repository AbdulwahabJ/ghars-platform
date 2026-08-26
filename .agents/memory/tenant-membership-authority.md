---
name: Tenant membership authority
description: Why customer authorization and staff references must resolve through the selected tenant membership.
---

Treat the global user row as identity only. Customer role, financial permission overrides, active/inactive status, staff assignment eligibility, and tenant-specific session invalidation belong to the selected tenant membership.

**Why:** A person may belong to multiple clinics. Reading or mutating role/activity from the global identity leaks authority across clinics; resolving assignees from global users can also store another customer's staff ID.

**How to apply:** Join the current active membership for every authorization, staff picker, default assignee, import, and user-management operation. Invalidate only sessions selected to the deactivated tenant. Keep platform-admin authority in its separate explicit table.