import { TooManyRequests } from "@mequest/contract"
import { Duration, Effect, Option } from "effect"
import { HttpEffect, type HttpServerRequest, HttpServerResponse } from "effect/http"
import { RateLimiter } from "effect/persistence"

interface Rule {
  readonly limit: number
  readonly window: Duration.Duration
}

/** Sign-in limits (ADR-0029). Every request counts, successful or not. */
export const signInLimits = {
  codeRequestsPerAddress: { limit: 10, window: Duration.minutes(15) },
  codeRequestsPerEmail: { limit: 5, window: Duration.hours(1) },
  verificationsPerAddress: { limit: 30, window: Duration.minutes(15) }
} as const satisfies Record<string, Rule>

/**
 * The client address after `HttpMiddleware.xForwardedHeaders`, which trusts
 * `X-Forwarded-For` only from `TRUSTED_PROXIES`.
 */
const clientAddress = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(request.remoteAddress, () => "unknown")

export const makeSignInLimits = Effect.gen(function*() {
  const limiter = yield* RateLimiter.RateLimiter

  const consume = (key: string, rule: Rule) =>
    limiter.consume({ key, limit: rule.limit, window: rule.window, algorithm: "fixed-window", onExceeded: "fail" })
      .pipe(
        Effect.asVoid,
        Effect.catchTag("RateLimiterError", (error) => {
          if (error.reason._tag !== "RateLimitExceeded") return Effect.die(error)
          const retryAfterSeconds = Math.max(1, Math.ceil(Duration.toSeconds(error.reason.retryAfter)))
          return HttpEffect.appendPreResponseHandler((_request, response) =>
            Effect.succeed(HttpServerResponse.setHeader(response, "retry-after", String(retryAfterSeconds)))
          ).pipe(Effect.andThen(Effect.fail(new TooManyRequests({ retryAfterSeconds }))))
        })
      )

  return {
    /** Per client address, then per email: unknown emails count too, so a 429 reveals no account. */
    codeRequest: (request: HttpServerRequest.HttpServerRequest, email: string) =>
      consume(`identity:code-request:address:${clientAddress(request)}`, signInLimits.codeRequestsPerAddress).pipe(
        Effect.andThen(consume(`identity:code-request:email:${email}`, signInLimits.codeRequestsPerEmail))
      ),
    verification: (request: HttpServerRequest.HttpServerRequest) =>
      consume(`identity:verify:address:${clientAddress(request)}`, signInLimits.verificationsPerAddress)
  } as const
})
