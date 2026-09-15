---
name: Registration location and phone compatibility
description: Safety rule for evolving tenant registration location and phone data without losing production values
---

**Rule:** Treat normalized tenant location and E.164 phone fields as additive canonical data. New registrations dual-write the established legacy city and digits-only phone fields, while migrations preserve those legacy values verbatim and normalize only deterministic matches.

**Why:** Production contains real tenants whose free-text cities may be ambiguous and whose existing phone field is used by compatibility checks and uniqueness rules. Replacing or broadly rewriting either field can lose user-entered data or break registration behavior.

**How to apply:** Extend analytics and admin features from the canonical country, normalized city, display city, E.164 phone, and phone-country fields. Retain legacy fallbacks for old rows, and leave unrecognized values available for later review rather than guessing.