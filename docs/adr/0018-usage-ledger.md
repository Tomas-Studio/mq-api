# ADR-0018: Append-only usage ledger with structural metering

Status: Accepted · 2026-11-23

## Context

The pricing model meters AI credits (monthly grant plus 12-month top-up lots),
active learners (monthly peak, packs of 50, cap at join), proctored sittings
(yearly allowance), staff seats, live programmes, storage, streaming above 1 TB,
and Assess sittings whose band depends on the campaign total.

## Decision

- `commerce.usage_ledger` is append-only: `grant`, `topup` (with expiry) and
  `usage` entries, each with an idempotency key.
- Balances, peaks and campaign totals are projections; lots are consumed
  earliest-expiry first.
- Enforcement reads a cached balance with a soft-cap overdraft threshold.
- `MeteredLanguageModel` is the only Layer providing the AI language model, so
  every model call writes a ledger entry.

## Consequences

- Invoices and disputes are answered from the ledger.
- The monthly usage reports (ADR-0010) are queries over it and must match finance's legacy figures.

## Alternatives considered

- Counters on the subscription: no history; expiring lots and banding don't fit.
- Stripe Billing meters: excludes NGN/bank-transfer clients; local balances still needed.
