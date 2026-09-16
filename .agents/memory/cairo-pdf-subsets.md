---
name: Cairo PDF subsets
description: PDFKit rules for searchable, visually clean Arabic/English exports with Fontsource Cairo.
---

Fontsource Cairo ships Arabic and Latin as separate WOFF subsets. A PDF renderer that uses the Arabic subset for every cell can display Arabic while silently losing ordinary English body text during extraction, and unsupported ASCII punctuation may render as boxes. Mixed Arabic/Latin/digit text needs a complete Cairo font, not a per-string choice between partial subsets. PDFKit alignment is not Unicode Bidi: logical Arabic passed directly to it can remain shaped but appear in the wrong visual order.

**Why:** Structural PDF tests initially passed because Arabic and the Latin footer were searchable, but visual inspection and body-text extraction exposed lost English cell text, LTR column ordering, and missing-glyph boxes around localized dates and currency.

**How to apply:** Use a complete Cairo font for Arabic and mixed-script strings; Latin-only strings may use the Latin subset. At the PDF drawing boundary, run logical RTL text through a conforming Unicode Bidi implementation and remove its isolate controls only after reordering; do not mutate stored/report values or hand-reverse words. Isolate LTR metadata values before Bidi resolution. Use NBSP only for short RTL labels where PDFKit collapses ordinary spaces, and reverse physical table-column order for RTL PDFs. Keep body-cell spaces wrappable. Keep PDFKit external in the API bundle because its `#standard-fonts/*` imports break when esbuild inlines it. Treat `pdftotext` as extraction evidence, not visual-order evidence; validate direction with rendered-page images and the production-style API bundle.