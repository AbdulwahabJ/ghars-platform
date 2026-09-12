---
name: Immutable media promotion
description: Safety rule for promoting browser uploads from staging into persistent canonical media.
---

Validate, download, and copy the exact same object generation from staging. Promote it to a fresh canonical key with a create-only destination precondition, and allow only one database record to own each canonical object.

**Why:** A reusable signed upload URL can overwrite staging between metadata inspection, byte validation, and copying. Unpinned operations can therefore validate one generation while persisting another.

**How to apply:** For future managed-media flows, pin reads and copies to the inspected generation, verify the complete byte length and detected MIME, store only canonical references, and never serve staging paths.