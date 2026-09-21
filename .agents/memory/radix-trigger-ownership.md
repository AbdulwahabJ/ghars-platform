---
name: Radix trigger ownership
description: Prevent dead clicks and stale pointer locks caused by multiple Radix trigger primitives owning one control.
---

One interactive control must have one Radix `Trigger` owner. Do not wrap a menu trigger in a tooltip trigger, or otherwise compose multiple `asChild` trigger primitives onto the same button. Use the primary trigger plus an accessible label and, when needed, a native `title`.

**Why:** In an authenticated production session, a button owned by both Tooltip and DropdownMenu triggers entered a repeated Radix update path. Pointerdown reached the button, click hit the document root instead, the menu stayed mounted, and modal pointer suppression remained on the page.

**How to apply:** When adding icon buttons for menus, dialogs, selects, popovers, or sheets, inspect the complete wrapper chain. Keep one trigger primitive per physical button and test repeated open/close cycles while checking that menus unmount and computed pointer events return to normal.