# ADR-0020: Durable background work on effect/workflow + cluster in a separate worker

Status: Accepted · 2026-11-23

## Context

Legacy runs 15 cron sweeps in-process, an email queue with exponential backoff,
outbound webhooks, payment-webhook processing and long AI generation, across
several App Service instances. `effect/cluster` stores messages and runner state
in SQL (`SqlMessageStorage`, `SqlRunnerStorage`) and provides `ClusterCron`,
`Singleton` and `SingleRunner`; `effect/workflow` provides `Workflow`,
`Activity`, `DurableClock`, `DurableDeferred` and `DurableQueue`.

## Decision

- `apps/worker` runs `SingleRunner` with SQL storage on a direct Neon connection
  (the runner storage takes session-level advisory locks; Neon's pooler does not support them).
- `ClusterCron` replaces the 15 sweeps; each fans out one workflow per organisation (ADR-0013).
- Multi-step processes are durable workflows, e.g. paid enrolment: create order →
  `DurableDeferred` resumed by the payment webhook → allocate seat → send welcome.
- Email and outbound webhooks are Activities with retry schedules.
- `apps/server` only starts workflows; it never runs them.

## Consequences

- Postgres is the only infrastructure for background work.
- `SingleRunner` is documented as single-process and these modules are
  `@stability unstable`; spike S4 proves restarts, redeploys and exactly-once cron.
- The worker cannot scale out without moving to multi-runner topology (needs
  addressable runners, e.g. AKS), which current load does not require.

## Alternatives considered

- Postgres job queue on Effect primitives (`FOR UPDATE SKIP LOCKED`, Schedules,
  advisory-lock leader): the fallback if S4 fails.
- Azure Service Bus + workers: new infrastructure, no Effect-native durability.
