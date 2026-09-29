---
name: Implant entry surfaces
description: How to avoid verifying the wrong implant form when a visual correction refers to a specific screen
---

**Rule:** Match the user's visible labels and surrounding screen to the actual entry point before changing or validating implant UX. Check every affected entry point, not just the patient-file dialog.

**Why:** A prior fix and browser check passed for the patient-file implant dialog while the Arabic dashboard quick-entry form still had native number inputs and an oversized Q list. Reporting a global PASS from the wrong screen hid the defect.

**How to apply:** When a request cites screenshots or field labels, locate those labels in the locale files and trace their rendering component. Drive that exact screen in browser QA and measure the requested behavior there; other forms are secondary regression checks.