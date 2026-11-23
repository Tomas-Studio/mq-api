# ADR-0016: One capability catalogue, declared per endpoint

Status: Accepted · 2026-11-23

## Context

Legacy decides access from four unrelated catalogues with different keys:
billing plan features, admin grant + manager switch per cohort, staff access
levels (none/view/manage with role presets and overrides), and learner pricing
tiers. Checks are hand-called (`requireCohortManager` in 203 routes).

## Decision

- One capability catalogue in `packages/domain` (e.g. `assessments.proctoring`,
  `community.post`).
- Endpoints declare what they need with `.annotate(Requires, …)` in
  `@mequest/contract`.
- A Policy middleware reads the annotation from `options.endpoint` and evaluates
  four gates in order; the first failure wins:
  1. plan (organisation entitlements + add-ons) → `not_in_plan` with upgrade option
  2. programme switch → `disabled_by_programme`
  3. role access level → `insufficient_role`
  4. learner tier → `not_in_tier`
- Denials are a typed `Forbidden` error carrying `gate`.
- Resource rules needing loaded data (author-only edits, submitted attempts are
  read-only) are typed errors in the owning context's service.

## Consequences

- The contract and OpenAPI document each endpoint's requirements.
- Clients render the right response per gate (upgrade prompt, hidden feature, read-only).
- Entitlements from commerce feed gate 1, linking pricing to access directly.

## Alternatives considered

- Policy checks called inside handlers: a missing call is silent again.
