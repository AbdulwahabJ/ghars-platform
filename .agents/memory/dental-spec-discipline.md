---
name: Dental spec discipline
description: How to work on the dental implant follow-up project — spec authority, phase gates, binding decisions
---

The 2,401-line spec at `attached_assets/Pasted-CRITICAL-EXECUTION-RULES-READ-THIS-ENTIRE-SPECIFICATION_1785569233237.txt` is the sole source of truth. All UI copy (tour steps, dialogs, help text) must match it verbatim — pull exact Arabic strings from the file, never paraphrase.

**Why:** The user enforces a strict no-invented-features rule and rejected anything beyond spec (no sidebar, dark mode, fake data, dead buttons, emojis; settings icon hidden until Phase 6).

**How to apply:**
- Work proceeds in phases with a hard stop for user approval at each gate; phase specs are preserved in `.local/tasks/phase-*.md`.
- Binding technical decisions (approved corrections) are summarized in `replit.md` under Architecture decisions — money as numeric(12,2), CSRF approach, permission override model, file_number global uniqueness, no stored derived totals, foreign numbers need explicit country code.
- Tour: exactly 6 counted steps ("N من 6") + a final screen with no counter and single button ابدأ العمل.
- Never seed patient data. Test data must be fully cleaned up afterward so first-run setup (INITIAL_SETUP_KEY) stays available for the user.
