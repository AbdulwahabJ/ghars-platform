---
name: Vite config must not require dev-only env vars at build time
description: Production `vite build` runs in a deploy environment without PORT/BASE_PATH; fail-fast env checks belong on the serve path only
---

# Keep dev-only env requirements out of the production build path

**Rule:** In `vite.config.ts`, never throw on missing `PORT` (or other dev-server-only env vars) at module top level. Resolve them lazily inside `defineConfig(({ command }) => ...)` and require them only when `command === 'serve'`. Default `BASE_PATH` to `/`.

**Why:** The deploy build environment runs `vite build` without providing `PORT`; a top-level fail-fast check made the production web build fail during the pre-publish gate, which would have blocked every deploy while dev worked fine.

**How to apply:** When adding fail-fast env validation to any config that is loaded by both dev serve and production build, gate it on the command/mode. Verify with `env -u PORT -u BASE_PATH NODE_ENV=production pnpm --filter <web> run build`.
