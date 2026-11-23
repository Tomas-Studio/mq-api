# ADR-0024: Modular monolith with enforced bounded contexts

Status: Accepted · 2026-11-23

## Context

Legacy documented "thin routes, all DB access in services", but nothing enforced
it: 598 of 1,088 route files import the database directly.

## Decision

- One deployable codebase split into bounded contexts (architecture §4) in
  `packages/contexts/src/<context>/`, shared by `apps/server` and `apps/worker`.
- Each context owns one Postgres schema, its repositories, services, HTTP handlers
  and workflows, and exports only `index.ts` (public services and Layers).
- Enforcement:
  - dependency-cruiser fails CI on imports of another context's internals;
  - Postgres: each context's work runs as `mq_ctx_<context>`, granted only its own schema;
  - Effect: a context's Layer provides only its public service.
- `reporting` reads other schemas only through published SQL views.
- Pure logic lives in `packages/domain`; the contract in `packages/contract`.

## Consequences

- Boundaries are checked by the compiler, CI and the database, not by convention.
- Contexts sit under `packages/` rather than `apps/server/src/` so the worker can
  compose the same contexts (refinement of the layout first sketched).

## Alternatives considered

- Package per context: compiler-enforced, but a dozen package.json/tsconfig pairs.
- Layered by technical role: the structure that eroded in legacy.
