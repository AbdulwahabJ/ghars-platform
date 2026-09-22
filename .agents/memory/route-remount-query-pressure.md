---
name: Route remount query pressure
description: Prevent rapid Ghars navigation from multiplying global and page-data requests.
---

Queries used by route-level Shell and page components need finite freshness windows, and high-churn read requests must consume TanStack Query's `AbortSignal`. Clicking the current active route must be a no-op.

**Why:** Rapid navigation repeatedly remounts Shell and page observers. With the default zero stale time, each remount refetched notifications and route data; obsolete fetches could not be aborted. The accumulated request/render work caused large transient node and listener spikes and matched the reported freeze pressure.

**How to apply:** Give frequently remounted read queries a short finite `staleTime`, preserve explicit mutation invalidation for correctness, pass query-function signals through the API client to `fetch`, and verify stress behavior with isolated per-endpoint request counts.