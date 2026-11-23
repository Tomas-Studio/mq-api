# ADR-0011: Data access with effect/sql and @effect/sql-pg

Status: Accepted · 2026-11-23

## Context

`@effect/sql-drizzle` (0.51.0) peers `effect ^3.22.0` and `drizzle-orm <0.50`;
there is no Drizzle bridge for v4. Legacy used Drizzle as a query builder (0
relational queries, 193 raw `sql` fragments).

## Decision

- `SqlClient.SqlClient` from `effect/sql`, provided by `PgClient.layer` /
  `PgClient.layerConfig` from `@effect/sql-pg`.
- Tagged-template SQL; rows decoded with `SqlSchema.findAll`, `findOne`,
  `findOneOption`, `findNonEmpty` against Effect Schemas.
- `SqlResolver` for batched lookups where N+1 patterns appear.
- Transactions via `sql.withTransaction`, which composes across any Effect.
- Repositories live inside their context and are never exported (ADR-0024).

## Consequences

- One type system end to end; `SqlError` and schema errors are typed failures.
- Schemas for tables are written by hand per context (an opportunity to model the
  new schema deliberately, ADR-0007).

## Alternatives considered

- Drizzle wrapped by hand: no supported adapter, transactions outside Effect,
  every row typed twice.
