---
name: Export enum localization
description: How Arabic/English exports handle canonical Arabic enum values without changing business data.
---

Localize fixed canonical enum values only while serializing PDF/XLSX cells and filter metadata. Keep stored values and query/filter inputs unchanged. Tenant-managed free-text lookup values remain as entered when no authoritative translation exists.

**Why:** Ghars stores many workflow states as canonical Arabic values. Rewriting them would risk business-data changes, while passing them through unchanged makes English exports mixed-language. Export-boundary translation preserves both data integrity and single-locale documents.

**How to apply:** When adding an export surface or a new fixed enum, add its English display label to the server export-localization dictionary and apply it to output rows only. Do not import frontend i18n modules into the API.