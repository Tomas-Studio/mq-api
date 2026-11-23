# ADR-0015: Opaque server sessions; cookie on web, bearer on mobile

Status: Accepted · 2026-11-23

## Context

Web and mobile both authenticate. The pricing model sells custom login domains
(`learn.<client>.com`); an API on another site would make its cookies
third-party, which browsers block.

## Decision

- One random opaque token per session in `identity.sessions`.
- Web: httpOnly, Secure, SameSite cookie `mq_session`. `/api/*` is served through
  Front Door on every web domain, including custom domains, so the cookie is
  always first-party and no CORS is needed.
- Mobile: same token type in SecureStore, sent as `Authorization: Bearer`.
- One `Authentication` middleware (`HttpApiMiddleware.Service` with
  `security: { cookie: HttpApiSecurity.apiKey({ in: "cookie", key: "mq_session" }), bearer: HttpApiSecurity.bearer }`)
  resolves either into `CurrentPerson`.
- Short per-instance cache; revocation deletes the row and evicts the cache.

## Consequences

- Instant revocation (suspension, staff removal, sign out everywhere).
- The per-request lookup is shared with membership resolution, which RLS needs anyway.
- Spike S1 verifies Front Door routing and first-party cookies on a custom domain.

## Alternatives considered

- JWT access + rotating refresh: revocation lag, refresh races, and RLS still needs a lookup.
- Bearer everywhere: tokens exposed to page scripts on web.
