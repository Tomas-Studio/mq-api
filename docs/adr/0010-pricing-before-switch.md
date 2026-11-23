# ADR-0010: Sell the new pricing now; meter with reports until each switch

Status: Accepted · 2026-11-23

## Context

The pricing model (v1.0, 2026-10-30) is ready to sell, but its limits (learner
caps, AI credits, proctored sittings, staff seats, library licences) will only be
enforced by mq-api. Legacy is frozen (ADR-0008).

## Decision

- Contracts state plan limits; legacy gets no new enforcement code.
- MEQuest ops runs monthly SQL usage reports over data legacy already records:
  peak active learners per cohort, AI cost from `ai_usage_logs`, proctored
  attempts per assessment. Overage is invoiced manually.
- The report queries and their outputs become golden fixtures (ADR-0009): the
  usage ledger must reproduce finance's figures on migrated data.
- Limits become hard-enforced when each deployment switches.

## Consequences

- Finance and mq-api agree on usage numbers from the first switch.
- Overage before the switch depends on manual review.

## Alternatives considered

- Learner cap and AI soft cap added to legacy in the in-flight window: throwaway code.
- Hold the new pricing until the switch: delays the commercial model.
