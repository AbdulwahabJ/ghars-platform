---
name: Operational localization namespaces
description: Namespace boundary for dashboard workflow copy and the legacy guidance resource.
---

Operational dashboard workflow copy belongs in the `operations` translation resource. The `guidance` resource is reserved for the product tour, quick help, and older shared dashboard guidance.

**Why:** Both resources expose a `dashboard` object. Adding a workflow key to the wrong one compiles successfully but renders the untranslated key in the expanded dashboard.

**How to apply:** When localizing operational UI, check the namespace used by the component and exercise an expanded dashboard row in both locales. Preserve the existing fallback only for legacy guidance strings.

Arabic mode must use natural Arabic for all system-controlled labels, values, dates, numbers, and currency; English mode must use English equivalents. Keep only true brand names, file-format names, and approved clinical acronyms untranslated. Never translate user-entered clinical text.

**Why:** Bilingual field labels and raw canonical values made a single screen appear half Arabic and half English even though its headings used translation keys.

**How to apply:** Localize controlled values at display/export boundaries, derive every formatter from the active app locale, and keep recursive Arabic/English key parity under automated test.