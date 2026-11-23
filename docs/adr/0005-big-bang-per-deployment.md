# ADR-0005: Big-bang cutover, one switch per deployment

Status: Accepted · 2026-11-23

## Context

The new product replaces web, mobile and API together. There are three
deployments: `demo` (mequest-learn), `reinmaths-be` (dedicated white-label
instance with its own database) and production (`mqlearn`).

## Decision

No route-by-route strangler. Each deployment switches once, completely, in order
of blast radius: demo → reinmaths → production. Each switch passes the go/no-go
gate in ADR-0009.

## Consequences

- Nothing reaches users until the demo switch, so the safety net (ADR-0009) is
  the main source of feedback before go-live.
- Legacy must stop moving (ADR-0008) or the parity target drifts.
- After go, the deployment rolls forward only.

## Alternatives considered

- Strangler via `/api` proxy rules: incremental and reversible, but incompatible
  with a full redesign of API, schema and clients.
- Switching all deployments at once: no smaller live deployment to learn from first.
