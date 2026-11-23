# ADR-0004: Mobile client is React Native + Expo

Status: Accepted · 2026-11-23

## Context

The contract distribution model depends on whether the mobile app can import
TypeScript and run Effect.

## Decision

The mobile app is built with React Native and Expo (TypeScript). It imports
`@mequest/contract` and `@mequest/client` directly.

## Consequences

- Domain types, validation and error types are shared rather than regenerated.
- The app can use Effect for retries, offline queues and sync (ADR-0023).
- Expo OTA updates ship JS-only fixes quickly; native changes still wait on store
  review, which the versioning policy accounts for (ADR-0017).
- OpenAPI is still generated for third parties (Checkout/Enrol API users).
- Spike S6 checks Effect v4 bundle size and behaviour on Hermes.

## Alternatives considered

- Flutter, native Swift/Kotlin: cross a language boundary; types regenerated from
  OpenAPI instead of shared.
