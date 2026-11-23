# ADR-0009: Layered cutover safety net

Status: Accepted · 2026-11-23

## Context

UI, API and schema are all new, so legacy and new responses cannot be diffed.
Legacy has no E2E tests. What can be compared is computed outcomes on the same data.

## Decision

Four layers:

1. **API journeys.** Every parity-list scenario is an API-level journey test in
   mq-api (`HttpApiTest` + `@effect/vitest` on real Postgres).
2. **Client E2E for critical paths only.** Playwright (web), Maestro (mobile), in
   their repositories.
3. **Nightly ETL rehearsal with golden outputs.** Legacy computes progress,
   certificate eligibility, grades, leaderboard points, transcripts and the
   monthly usage-report figures (ADR-0010) on the anonymised snapshot; mq-api
   computes the same on the migrated data; the two must match.
4. **Go/no-go per switch.** Freeze legacy writes → Neon branch `pre-switch-<date>`
   → final ETL → reconciliation + golden diff → go / no-go. After go, roll
   forward only; the pre-switch branch is the disaster-restore point.

## Consequences

- A golden-output export script is added to `mqlearn` (tooling).
- The rehearsal is a CI job, not a manual step; a red rehearsal blocks switches.

## Alternatives considered

- Reverse sync for a rollback window: effectively a second ETL for every write path.
- API tests plus manual UAT: misses subtle computed-outcome regressions.
- Playwright journeys against the legacy UI: invalid once the UI is replaced.
