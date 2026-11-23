# ADR-0008: Freeze legacy features after an in-flight window

Status: Accepted · 2026-11-23

## Context

Legacy changes fast (~4 frontend commits a day and ~40 migrations a month over
the last 180 days). With a redesigned schema, every legacy feature also needs a
rebuild in mq-api, an ETL mapping and work in both new clients.

## Decision

Agree a freeze date after a short window for work already in progress. After
the freeze, legacy takes only bugfixes and security patches from a `release/*`
branch. The feature inventory on the freeze date is the **parity list**: the
acceptance list for the new product.

## Consequences

- The legacy deploy workflows (`deploy.yml`, `deploylive.yml`, `reinmaths.yml`)
  retarget to the release branch.
- New features are built only in the new product.
- Scripts that support the cutover (golden-output export) may still be added to
  `mqlearn`; they are tooling, not features.

## Alternatives considered

- Keep shipping with a "parity tax" per feature: everything built twice, moving target.
- Freeze immediately: shelves nearly finished work.
