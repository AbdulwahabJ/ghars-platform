---
name: i18n namespace registration
description: How Ghars translation namespaces are loaded safely at startup.
---

All i18next namespaces must be imported and registered in the central i18n initialization module; components may select a namespace with `useTranslation`, but must not add resource bundles at render time.

**Why:** Side-effect registration creates import cycles and can produce missing-resource or React/HMR context failures while modules reload.

**How to apply:** When adding a translation domain, export plain `ar` and `en` resource objects, add both to the central resource map and namespace list, then use that namespace from components. Programmatic i18next lookups must use `namespace:key` (for example, `validation:required`), not dotted `namespace.key`, which resolves as a missing key.