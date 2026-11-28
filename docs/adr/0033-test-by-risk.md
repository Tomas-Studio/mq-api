# ADR-0033: Test by risk

Status: Proposed · 2026-11-28 · amends ADR-0026 (what to test, and how hard)

## Context

ADR-0026 settles how to test (test-first, real Postgres, Layer doubles,
property tests) but not how much. Slice 0 reached 112 tests before its third
endpoint. Most guard real risks (tenant isolation, sign-in), but 16 added
nothing: the same four checks ran against four names for one id schema, and
ten tests covered a development-only seed script. Testing everything to the
same depth slows the work and the suite without making the system safer.

## Decision

Tests are written where a bug would be costly or hard to notice, at the depth
that risk warrants.

| Tier | Covers | How |
|---|---|---|
| 1. Thorough | Tenant isolation and RLS, sign-in and sessions, access checks, rate limits, money (pricing, entitlements, usage ledger), grading and progress, the ETL, the API contract | Every path and error. Property tests for pure logic, golden outputs for the ETL, the OpenAPI diff gate for the contract. Each change is mutation-checked: break it on purpose and confirm a test fails. |
| 2. One pass over HTTP | Ordinary endpoints | Through the server, as clients call it: the success case, each declared error, the permission check. About 3 to 6 tests per endpoint. |
| 3. Smoke | Development tooling (seed, local scripts) | A few tests for what would silently corrupt data or mislead: idempotency, refusing the wrong role. Not every input. |
| None | What types and schemas already enforce; Effect and Postgres behaviour; internal helpers covered by tier 1 or 2 tests | No tests. |

- **Invariant tests are preferred over repetition.** A test that checks a rule
  across the whole schema or API (`findRlsViolations`, the endpoint-declaration
  test, the `uuidv7()` default check) covers every future table or endpoint at
  no extra cost. A rule that applies everywhere gets one invariant test, not a
  test per feature.
- **Shared code is tested once.** When several names share one implementation
  (the id schemas), test the implementation once and assert that each name uses
  it, rather than repeating the cases per name.
- **The suite has a budget.** No flaky test stays in the suite: fix it or
  delete it the same day. CI runs the full suite in under 5 minutes; when it
  grows past that, split it or cut tests before adding more machines.

## Consequences

- Test counts grow with tier-1 and tier-2 features, not with lines of code.
  Several hundred tests by legacy parity is expected.
- Reviews ask which tier a change is in. A tier-1 change without a
  mutation check is incomplete.
- The id schema and seed tests were cut from 26 to 10 with no loss of
  coverage: each deliberate break still caught by the remaining tests.

## Alternatives considered

- **Test everything to the same depth.** Rejected: slower work and suite, and
  duplicated tests that break together on every change.
- **Coverage targets (a percentage).** Rejected: a percentage rewards testing
  easy code and says nothing about whether the risky paths are tested.
- **Test only through HTTP.** Rejected: RLS and ledger arithmetic need direct
  database and property tests that an HTTP call cannot reach.
