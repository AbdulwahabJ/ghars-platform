---
name: Permanent clinical deletion
description: Safety rules for irreversible case and patient deletion in Ghars.
---

Permanent case deletion must use explicit case IDs, even when the operational table visually groups cases under patients. Never infer every case under a selected patient from the patient-level archive checkbox. Full patient deletion remains a separate action.

**Why:** Patient-group selection is intentionally broader than case selection. Reusing it for destructive case deletion can erase multiple treatment histories when the admin intended to select one case.

**How to apply:** Keep archive and permanent-delete selection state separate. Preview the exact recursively affected graph, bind it to a tenant-scoped token, then lock and recompute the graph inside the confirmation transaction. Reject stale previews before any audit or deletion mutation.