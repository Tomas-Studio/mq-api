# ADR-0017: Additive-only API evolution with a CI gate and minimum client version

Status: Accepted · 2026-11-23

## Context

Mobile builds stay installed for months; web deploys in lockstep with the API.

## Decision

- One live API with no URL versions. Changes must be backward compatible:
  new endpoints and optional fields are allowed; removing, renaming or tightening is not.
- CI generates OpenAPI with `OpenApi.fromApi(MeQuestApi)` and diffs it (oasdiff)
  against the last released contract. Breaking changes fail the build unless the
  endpoint has completed deprecation.
- Deprecation: `Deprecation` and `Sunset` headers → support window → removal once
  telemetry shows no callers.
- Clients send `X-MeQuest-Client: <platform>/<version>`; the server records
  versions in use and returns 426 below a configured minimum.
- `@mequest/contract`: additive change = minor; removal after deprecation = major.

## Consequences

- Old app builds keep working until deliberately retired.
- Every PR touching the contract runs the diff gate.

## Alternatives considered

- URL major versions: parallel handler sets per version.
- Lockstep with forced updates: strands users waiting on store review or offline.
