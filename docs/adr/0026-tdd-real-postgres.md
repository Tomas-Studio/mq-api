# ADR-0026: Test-first, integration-first on real Postgres

Status: Accepted · 2026-11-23 · amended by ADR-0028 (local Postgres source)

## Context

Legacy's 124 test files mock the database, so SQL, tenant scoping and
transactions are never exercised. The new design's main risks (RLS, roles,
tenant transactions, ledger arithmetic) live exactly there.

## Decision

- Red-green-refactor by default.
- `@effect/vitest`: `it.effect`, `it.layer(layer)(name, (it) => …)`, `it.prop`.
- Real Postgres: any server named by `TEST_DATABASE_URL` (CI service container,
  local Postgres, Neon branch), else Testcontainers. Migrations, roles and RLS
  are applied once to a template database; each test file gets its own database
  cloned from it, so `SqlClient`, `SystemSql` and committed transactions behave
  as in production.
- External providers (Stripe, Paystack, AI models, Resend, Expo push) replaced by
  Layer test doubles; no module mocking.
- Pure domain logic (pricing, proration, discount caps, banding, policy gates,
  grading, spaced repetition) gets property tests from Schema arbitraries.
- `TestClock` drives schedules, expiry, grace periods and dunning.
- API journeys (ADR-0009) via `HttpApiTest`.

## Consequences

- Tests prove isolation (a cross-tenant read returns nothing) rather than assume it.
- Neon branches serve previews and the nightly rehearsal, not unit tests.

## Alternatives considered

- Integration tests written after the code: tends to test implementation.
- Mocked database: leaves the new risks untested.
