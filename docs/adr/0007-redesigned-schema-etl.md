# ADR-0007: Redesigned schema with a rehearsed ETL

Status: Accepted · 2026-11-23

## Context

The legacy schema (205 tables, 45 enums, 44 jsonb columns) is cohort-centric with
no organisation, split identities, and four overlapping feature concepts. Legacy
migrations are plain forward-only SQL applied by a custom runner.

## Decision

mq-api owns a new database with a schema designed from the domain:
organisation-first, one schema per bounded context, `organisation_id` on every
tenant-scoped row. The legacy database is never written to. A re-runnable,
idempotent ETL (Effect program, `packages/etl`) transforms legacy data:

- Reads legacy with a read-only role; writes as `mq_migrator`.
- `etl.id_map(legacy_table, legacy_id, new_id)` makes every run idempotent.
- Reconciliation queries compare counts and key aggregates per entity.
- Rehearsed nightly against an anonymised legacy restore (Neon branch
  `legacy-mirror`) into a reset `etl-rehearsal` branch.
- Run for real at each switch after legacy writes are frozen.

mq-api runs its own migrations with `effect/sql` `Migrator` (`PgMigrator`).

## Consequences

- RLS covers every tenant table from day one (ADR-0012).
- A legacy hotfix that changes the legacy schema breaks the nightly rehearsal,
  which is the intended early warning.
- Identity merge (staff + learner with the same email) produces a conflict report
  that is reviewed before each switch.
- Rollback after go is a restore, not a reverse sync (ADR-0009).

## Alternatives considered

- Keep the legacy schema and evolve it after cutover: no ETL, but RLS and the
  organisation model would wait until after the switch.
- Domain-by-domain redesign with sync triggers: most moving parts, fragile.
