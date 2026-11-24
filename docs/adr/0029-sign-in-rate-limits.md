# ADR-0029: Rate-limit sign-in in Postgres

Status: Proposed · 2026-11-24

## Context

Email-code sign-in (ADR-0015) allows five guesses per code and a new code every
30 seconds. Without further limits an attacker can make about 14,000 guesses a
day against one account. Legacy limits code requests to 10 per IP per 15
minutes, in process memory, so the count is per instance and resets on deploy.
The architecture (§5.12) plans Front Door WAF rules per IP plus a
Postgres-backed limiter on sign-in, code and invitation endpoints; Redis is
retired.

## Decision

- Use Effect's `RateLimiter` (`effect/persistence`) with a Postgres
  `RateLimiterStore` (`PgRateLimiterStore` in `@mequest/db`). The store
  implements the fixed-window algorithm only; token-bucket and adaptive calls
  are defects.
- Counters live in `ratelimit.counters`, a global table (no tenant) reached only
  through `withGlobal("mq_ctx_ratelimit")`. Keys are stored as SHA-256 hashes, so
  no email address or IP address is stored. Time comes from `Clock`.
- Limits:

  | Endpoint | Counted per | Limit |
  |---|---|---|
  | `POST /api/auth/email-code` | client address | 10 per 15 minutes (as legacy) |
  | `POST /api/auth/email-code` | email, known or not | 5 per hour |
  | `POST /api/auth/email-code/verify` | client address | 30 per 15 minutes |

- Every request counts, successful or not. Each check runs in its own
  transaction before the identity work.
- Over the limit: `429 TooManyRequests { retryAfterSeconds }`. Because unknown
  emails are counted the same way, a 429 reveals nothing about who has an account.
- The client address is `request.remoteAddress` after Effect's
  `HttpMiddleware.xForwardedHeaders`, which trusts `X-Forwarded-For` only from
  networks listed in `TRUSTED_PROXIES` (empty by default: the transport peer).
  The Front Door and App Service networks are set during spike S1.

## Consequences

- At most 5 codes × 5 attempts = 25 guesses per account per hour, about 0.06%
  of the code space a day.
- Limits hold across server instances and deploys.
- One extra short transaction per sign-in request.
- Anyone can stop an email address from receiving codes for up to an hour by
  requesting codes for it. Accepted; other sign-in methods are unaffected.
- Expired counters stay until the worker gets a purge job (with `ClusterCron`).
- Invitation endpoints reuse the same limiter when they arrive.

## Alternatives considered

- In-memory per instance (legacy): not shared between instances, lost on deploy.
- Effect's Redis store: Redis is retired.
- Front Door WAF only: cannot count per email.
