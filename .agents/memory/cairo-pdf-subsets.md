---
name: Cairo PDF subsets
description: PDFKit rules for searchable, visually clean Arabic/English exports with Fontsource Cairo.
---

Fontsource Cairo ships Arabic and Latin as separate WOFF subsets. A PDF renderer that uses the Arabic subset for every cell can display Arabic while silently losing ordinary English body text during extraction, and unsupported ASCII punctuation may render as boxes.

**Why:** Structural PDF tests initially passed because Arabic and the Latin footer were searchable, but visual inspection and body-text extraction exposed lost English cell text, LTR column ordering, and missing-glyph boxes around localized dates and currency.

**How to apply:** Select the Cairo subset from each text value's script, strip bidi control characters before drawing, replace unsupported ASCII punctuation in Arabic-formatted output, use localized metadata labels, and reverse physical table-column order for RTL PDFs. Keep PDFKit external in the API bundle because its `#standard-fonts/*` package imports break when esbuild inlines it. Validate with both `pdftotext`, a rendered-page image, and the production-style API bundle.