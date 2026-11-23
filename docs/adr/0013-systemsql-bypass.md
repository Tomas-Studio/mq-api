# ADR-0013: Typed SystemSql for cross-tenant work; jobs fan out per organisation

Status: Accepted · 2026-11-23

## Context

Some actors have no single tenant: platform-admin views (342 legacy routes gate
on the admin role), 15 scheduled sweeps, and the payment webhook (which must read
its payload to find the organisation).

## Decision

- A second, small pool (max 5) connects as `mq_system` and is exposed only as a
  `SystemSql` service, distinct from `SqlClient`.
- Code that crosses tenants must require `SystemSql`, so every bypass is visible
  in types and review, and nothing reaches it by accident.
- Platform-admin handlers and the payment webhook use it.
- Scheduled jobs use it only to list organisations, then run each organisation's
  work as its own workflow in that organisation's RLS scope.

## Consequences

- One organisation's failure or slowness does not stall a sweep.
- If Neon refuses `CREATE ROLE … BYPASSRLS` from SQL (spike S3), policies admit
  `current_user = 'mq_system'` explicitly; the `SystemSql` design is unchanged.

## Alternatives considered

- Global sweeps through SystemSql: jobs run outside RLS.
- One role with a bypass flag in policies: any code path can set the flag.
