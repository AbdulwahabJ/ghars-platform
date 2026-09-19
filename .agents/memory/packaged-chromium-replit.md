---
name: Packaged Chromium on Replit
description: Production runtime requirements for server-side PDF rendering with @sparticuz/chromium.
---

When using `@sparticuz/chromium` for server-side PDF generation on Replit, declare the Nix packages `nss` and `nspr`; the packaged binary does not provide their shared libraries.

**Why:** Development succeeded with Replit's built-in Chromium, but a real `NODE_ENV=production` launch of the packaged binary failed with missing `libnspr4.so`, `libnss3.so`, and `libnssutil3.so`.

**How to apply:** Test the packaged path explicitly under `NODE_ENV=production`, not only the development Chromium path. Confirm the binary launches and renders a PDF before treating production compatibility as verified.