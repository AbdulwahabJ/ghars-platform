---
name: Unicode download headers
description: Safe Content-Disposition handling for Arabic and other non-ASCII filenames.
---

Never place a user-supplied non-ASCII filename directly in the quoted `filename` parameter of a `Content-Disposition` response header. Use an ASCII-only fallback there and carry the real filename in an RFC 5987 `filename*=UTF-8''...` parameter.

**Why:** Node rejects raw Arabic header characters with `ERR_INVALID_CHAR`. If content headers were already set and a broad error handler catches the exception, a valid private object can be misreported as a storage 404 and browsers show a broken image.

**How to apply:** Use this pair for every inline-view and download response that includes user filenames. Regression tests should include an Arabic filename and assert both successful binary delivery and the two safe filename parameters.