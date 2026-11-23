# ADR-0027: Walking skeleton first, then dependency order

Status: Accepted · 2026-11-23

## Context

Under a big-bang cutover nothing reaches users until the first switch, so build
order cannot bring value forward; it can bring forward the discovery of wrong
assumptions. Several decisions rest on unproven facts (spikes S1–S8).

## Decision

Slice 0 is one thin feature through every architectural decision: email-code
sign-in → current organisation → list my programmes, on web and mobile, deployed
to demo infrastructure from Bicep behind Front Door on a test custom domain.
Acceptance checks are listed in architecture §9.

Then contexts in dependency order: identity → organisations + access + commerce
entitlements/usage → content → learning → assessment → live → community +
mentoring → notifications + ai → commerce invoicing and collection →
integrations → reporting + audit.

## Consequences

- Every unproven assumption fails early and cheaply, before code depends on it.
- Client teams get a working authenticated API and published contract first.

## Alternatives considered

- Learner core first: cross-cutting decisions exercised late.
- Commerce first: no earlier value under big-bang; clients have nothing to build against.
