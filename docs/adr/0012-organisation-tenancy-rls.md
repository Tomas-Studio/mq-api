# ADR-0012: Organisation tenancy enforced by row-level security

Status: Accepted · 2026-11-23

## Context

The pricing model bills organisations, which do not exist in legacy. Identities
are global (`learners.email`, `users.email` unique); a learner can belong to
cohorts of several organisations. Dedicated instances are separate deployments.

## Decision

- The organisation is the tenant. Identities stay global; memberships are scoped.
- Every tenant-scoped table has `organisation_id NOT NULL`, RLS enabled and
  `FORCE ROW LEVEL SECURITY`, with
  `USING (organisation_id = current_setting('app.organisation_id', true)::uuid)`.
- Tenant work runs in `sql.withTransaction`, beginning with
  `SELECT set_config('app.organisation_id', $1, true)` and
  `SET LOCAL ROLE mq_ctx_<context>`. Both are transaction-local, as required by
  Neon's transaction-mode pooler.
- Roles are created by migration with SQL, never through the Neon Console
  (Console roles join `neon_superuser`, which carries `BYPASSRLS`):
  `mq_migrator` (owner), `mq_app` (runtime, `NOBYPASSRLS`), `mq_ctx_<context>`
  (`NOLOGIN`, grants on one schema), `mq_system` (ADR-0013).
- CI asserts `mq_app` has `rolbypassrls = false` and every tenant table forces RLS.

## Consequences

- Isolation holds even if application code forgets a filter.
- Every tenant-scoped request opens a transaction; SSE streams re-scope per read.
- A person's cross-organisation view is assembled from one scoped read per membership.
- Spike S2 verifies `set_config` and `SET LOCAL ROLE` through the Neon pooler.

## Alternatives considered

- Type-level enforcement only (`CurrentOrganisation` in the R channel): no database guarantee.
- Per-organisation identities: breaks global email uniqueness and unified identity.
