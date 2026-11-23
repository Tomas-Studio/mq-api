# ADR-0002: Build on Effect v4, pinned exactly

Status: Accepted · 2026-11-23

## Context

`effect@4.1.5` is npm `latest`; v3 (`3.22.5`) is `prev`. In v4 the ecosystem
ships as one version: HTTP, HttpApi, Schema, SQL, RPC, workflow, cluster, AI and
observability are subpaths of `effect` (`effect/http-api`, `effect/sql`, …), with
platform, driver and provider packages (`@effect/platform-node`, `@effect/sql-pg`,
`@effect/ai-*`, `@effect/vitest`) versioned in lockstep.

`MIGRATION.md` in the reference states that the subpath modules (`ai`, `cluster`,
`http`, `http-api`, `observability`, `rpc`, `schema`, `sql`, `workflow`, …) and
all packages other than `effect` are `@stability unstable`: new features may
land in patch releases and breaking changes in minor releases. Core modules
(`Effect`, `Layer`, `Context`, `Schema` constructors used here) are stable.

Most tutorials and model training data describe v3.

## Decision

Build on Effect v4. Dependencies:

```
effect                 4.1.5
@effect/platform-node  4.1.5
@effect/sql-pg         4.1.5
@effect/vitest         4.1.5
@effect/ai-anthropic   4.1.5
@effect/ai-openai      4.1.5
```

Policy for unstable modules:

- Exact versions only (no `^` or `~`); all Effect packages bumped together.
- Upgrade one release at a time, on a dedicated PR, reading the changelogs.
- `reference/effect` moves to the matching tag in the same PR.
- Unstable APIs are used inside contexts and `packages/contract`, so a breaking
  change is contained behind context seams.

## Consequences

- One dependency family instead of a dozen independently versioned packages.
- Web search results and model suggestions must be treated as suspect;
  `CLAUDE.md` lists verified v4 idioms and the reference source is authoritative.
- Requires Node ≥ 22.19 (`@effect/platform-node` engines).

## Alternatives considered

- Effect v3: better documentation coverage, but starts one major behind, with
  separately versioned 0.x packages that were equally unstable in practice.
