# ADR-0031: A person reads their own memberships across organisations

Status: Proposed · 2026-11-24

## Context

`GET /api/me/organisations` lists every organisation a person belongs to.
Membership rows are tenant data (ADR-0012), so a tenant scope shows one
organisation at a time, and the person's organisations are not known before
the query runs. `SystemSql` is reserved for platform-admin endpoints, the
payment webhook and job fan-out (ADR-0013).

## Decision

- A third database scope, `withPerson({ personId, role })`, next to
  `withTenant` and `withGlobal`. It opens a transaction, sets `app.person_id`
  with `set_config(…, true)` and runs `SET LOCAL ROLE`. No organisation is set.
  It does not nest with the other scopes in either direction.
- Tables whose rows belong to one person (`access.org_memberships`,
  `access.programme_roles`) add a second policy, `own_rows`:
  `FOR SELECT USING (person_id = tenancy.current_person_id())`.
  Writes still need the tenant scope.
- Every tenant table must have a `tenant_isolation` policy. Any other policy
  must be `FOR SELECT`. `findRlsViolations` checks both.
- Organisation details are then read with one tenant-scoped read per
  membership, as ADR-0012 says.

## Consequences

- A person can list their own memberships without `SystemSql` and without a
  copy of them outside the tenant tables.
- A person scope sees only rows that name that person, and cannot write.
- Listing a person's organisations costs one transaction for the memberships
  and one per organisation.

## Alternatives considered

- `SystemSql`: crosses every tenant for a routine, person-facing read, which
  ADR-0013 rules out.
- A global membership index in `identity`: a second copy of access data,
  written twice on every change.
- An `org.organisations` policy that joins `access`: couples two schemas and
  their grants.
