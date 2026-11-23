# ADR-0001: Backend-only repository with a pinned Effect reference

Status: Accepted · 2026-11-23

## Context

The legacy backend is the Nitro server inside `mqlearn`, sharing a repository,
build and deploy with a ~400k LOC Nuxt frontend. The new backend must be built
while legacy keeps running in production, with its own CI, deploy pipeline and
release cadence.

## Decision

The backend lives in its own repository, `mq-api`, next to `mqlearn`. The Effect
source is cloned into `reference/effect` (gitignored) and checked out at the tag
of the Effect release installed in the workspace (currently `effect@4.1.5`).

## Consequences

- Legacy is untouched; mq-api has an independent pipeline.
- The reference clone is the primary documentation for Effect v4. It must be
  moved to the new tag in the same PR that bumps Effect.
- Clients consume mq-api through a published contract (ADR-0003).

## Alternatives considered

- Workspace package inside `mqlearn`: inherits the legacy build and makes the
  backend boundary a convention.
- New umbrella monorepo absorbing the frontend: largest upfront move; superseded
  once new clients were introduced in separate repos (ADR-0003).
