# ADR-0019: mq-api owns organisation invoicing; providers only collect

Status: Accepted · 2026-11-23

## Context

Legacy bills platform plans through Stripe only; Naira clients are invoiced by
bank transfer and activated by hand. The pricing model needs USD/NGN/GBP price
books, add-ons, prorated upgrades, quarterly true-ups for annual plans, discount
stacking capped at 30% (never on usage), multi-year price locks, and Assess
campaign banding with a $750 minimum.

## Decision

- `commerce` computes every invoice: price-book line, add-ons, overage from the
  usage ledger, discounts, proration, true-ups, campaign banding at campaign close.
- Invoices are immutable documents.
- Collection is pluggable: Stripe (USD/GBP cards), Paystack (NGN cards), bank
  transfer with reconciliation. Each confirms payment against the same invoice.
- Dunning: 7-day grace → managers read-only; learners keep access; no data deleted.
- Learner payments (checkout, tiers, discounts, seat sales, payouts with platform
  fee split at source) keep the provider abstraction legacy already has.

## Consequences

- One source of truth for finance in every currency.
- Pricing rules are pure functions in `packages/domain` with property tests (ADR-0026).

## Alternatives considered

- Stripe Billing as the engine with Naira by hand: NGN revenue outside the system.
- Stripe Billing + Paystack subscriptions: two engines to keep in sync; no metered overage on Paystack.
