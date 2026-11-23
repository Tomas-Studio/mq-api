# ADR-0003: Separate client repositories; contract published as a package

Status: Accepted · 2026-11-23

## Context

mq-api serves two new clients: a web app and a React Native mobile app. All three
are TypeScript. The contract (HttpApi definition, Schemas, errors) can be shared
directly as code.

## Decision

Web and mobile live in their own repositories. mq-api publishes:

- `@mequest/contract`: HttpApi groups, Schemas, tagged errors, the content block
  union. Depends on `effect` only.
- `@mequest/client`: HttpApiClient factory plus client middleware for auth,
  `X-MeQuest-Client` and `Idempotency-Key`.

Both are published to GitHub Packages with semver. The web framework choice
belongs to the web repository.

## Consequences

- Clients upgrade deliberately; a breaking contract change surfaces when a client
  upgrades, so compatibility is enforced in mq-api's CI (ADR-0017).
- GitHub Packages requires the npm scope to match the owner: `@mequest/*` needs
  a GitHub organisation named `mequest`; otherwise the scope is `@itaobong/*`.
- The contract package must stay free of server-only dependencies.

## Alternatives considered

- One product monorepo (api + web + mobile): atomic cross-client changes; chosen
  first, then revised in favour of independent repositories.
- Backend repo plus a client monorepo: loses the atomic-change benefit at the
  contract seam anyway.
