# ADR-0006: Clean API redesign with no legacy adapter

Status: Accepted · 2026-11-23

## Context

Legacy has 1,088 route files with ad-hoc response shapes (the documented `ok()`
envelope is used by 0 routes) and H3 error bodies read at 246 frontend sites.
The legacy frontend is being replaced, not ported.

## Decision

The API is designed from the domain, not from the legacy routes. There is no
compatibility adapter; legacy `mqlearn` keeps talking to Nitro until each
deployment switches.

## Consequences

- One envelope and one error model (ADR-0016, architecture §5.5).
- The new surface is expected to be much smaller than 1,088 routes, since many
  legacy routes are variants of one query for different callers.
- Response diffing against Nitro is impossible; the safety net compares computed
  outcomes instead (ADR-0009).

## Alternatives considered

- Wire-compatible port, hybrid (legacy shapes for ported routes), clean core with
  legacy adapter: all assumed the legacy frontend would keep calling the API.
