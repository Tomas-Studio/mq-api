# ADR-0028: Bun runtime and toolchain

Status: Accepted · 2026-11-23 · amends ADR-0002 (platform package), ADR-0025
(compute runtime), ADR-0026 (local Postgres source)

## Context

The team wants the Bun ecosystem instead of Node, pnpm and Turborepo. Facts
checked against `effect@4.1.5` and npm:

- `@effect/platform-bun` 4.1.5 ships in lockstep with `effect`: `BunHttpServer`
  (including `layerTest`), `BunRuntime`, `BunServices`, `BunClusterHttp`,
  `BunClusterSocket`, `BunWorker`.
- `@effect/sql-pg` 4.1.5 implements the Postgres wire protocol itself over
  `node:net` / `node:tls`; it has no `pg` or `postgres` runtime dependency.
- Effect's own CI runs its full test suite, including the Testcontainers Postgres
  integration tests, under Bun 1.4.0 with `bun run --bun vitest run`.
- `@effect/vitest` requires vitest 5. `bun test` cannot run it.
- App Service on Linux has no built-in Bun runtime stack; it runs custom containers.

## Decision

- **Runtime:** Bun 1.4 in development, CI and production. `@effect/platform-bun`
  (`BunHttpServer`, `BunRuntime`, `BunServices`) replaces `@effect/platform-node`.
- **Packages:** Bun workspaces (`workspace:*`), text `bun.lock` committed,
  exact versions (`bunfig.toml` `install.exact`), isolated linker so a package
  can only import what it declares.
- **Tasks:** no Turborepo. `tsc -b` project references give incremental type
  checking; `bun run --filter` runs per-package scripts. Revisit if CI time grows.
- **Tests:** vitest 5 under Bun (`bun run --bun vitest run`) with
  `@effect/vitest`, as Effect's CI does. Not `bun test`.
- **Type checking:** `tsc -b` with TypeScript 7. Bun strips types without checking them.
- **Lint and format:** oxlint and dprint with the Effect repo's native rules. Its
  custom `effect/*` lint plugin is not published, so those rules are omitted.
- **Postgres driver:** `@effect/sql-pg`, not `Bun.sql`. The migrator, cluster
  storage and every repository build on `effect/sql`.
- **Deployment:** server and worker ship as one container image based on
  `oven/bun` (pinned by digest), pushed to Azure Container Registry and run on
  App Service for Containers (Linux) with managed-identity pulls; each app sets
  its own start command. This was ADR-0025's fallback for spike S8.
- **Integration database:** tests read an admin connection string from
  `TEST_DATABASE_URL` (CI service container, a local Postgres, or a Neon
  branch). When it is unset, Testcontainers starts Postgres, which needs Docker.

## Consequences

- One runtime from laptop to production; faster installs and cold starts.
- The pipeline gains an image build and a registry; the App Service plan, Front
  Door and Neon topology are unchanged.
- Bun's Node compatibility is the main risk. Effect runs its suite on Bun but
  skips a few Node-specific tests. Spike S8 now covers the Bun container on App
  Service: health checks, SSE through Front Door, graceful stop on redeploy, and
  the worker's direct `LISTEN` and advisory-lock connections.
- Published packages (`@mequest/contract`, `@mequest/client`) still compile to
  plain JavaScript; web (Vite) and mobile (Expo) consumers do not need Bun.
- Without Docker, local integration tests need `TEST_DATABASE_URL`.

## Alternatives considered

- Bun for installs and tests, Node in production: keeps App Service's built-in
  Node stack, but tests would run on a different runtime from production.
- `bun test`: faster start, but loses `@effect/vitest` (`it.effect`,
  `it.layer`, `it.prop`, `TestClock` integration) that ADR-0026 relies on.
- Azure Container Apps for the containers: native scale rules; more new
  operational surface. Remains the fallback if App Service containers fail S8.
- Keep Turborepo: remote caching is not needed at this repository's size.
