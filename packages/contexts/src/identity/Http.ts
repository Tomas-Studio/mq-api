import { Authentication, CurrentPerson, CurrentSession, MqApi, SessionCookie } from "@mequest/contract"
import { DateTime, Duration, Effect, Layer, Redacted } from "effect"
import { HttpEffect, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { Identity, SessionLifetime } from "./Service.ts"

// httpOnly and Secure come from securitySetCookie's defaults; set here too so
// the policy is visible in one place (ADR-0015).
const cookieOptions = { httpOnly: true, secure: true, sameSite: "lax", path: "/" } as const

const setSessionCookie = (token: Redacted.Redacted<string>) =>
  HttpApiBuilder.securitySetCookie(SessionCookie, token, {
    ...cookieOptions,
    maxAge: Duration.toSeconds(SessionLifetime)
  })

const clearSessionCookie = HttpEffect.appendPreResponseHandler((_request, response) =>
  Effect.orDie(HttpServerResponse.expireCookie(response, SessionCookie.key, cookieOptions))
)

export const IdentityHttp = HttpApiBuilder.group(MqApi, "identity", (handlers) =>
  Effect.gen(function*() {
    const identity = yield* Identity
    return handlers
      .handle("requestEmailCode", ({ payload }) => identity.requestEmailCode(payload.email))
      .handle("verifyEmailCode", ({ payload }) =>
        Effect.gen(function*() {
          const signedIn = yield* identity.verifyEmailCode(payload)
          const expiresAt = DateTime.fromDateUnsafe(signedIn.expiresAt)
          if (payload.transport === "cookie") {
            yield* setSessionCookie(signedIn.token)
            return { person: signedIn.person, expiresAt }
          }
          return { person: signedIn.person, expiresAt, token: Redacted.value(signedIn.token) }
        }))
      .handle("signOut", () =>
        Effect.gen(function*() {
          const session = yield* CurrentSession
          yield* identity.signOut(session.id)
          yield* clearSessionCookie
        }))
      .handle("me", () =>
        Effect.gen(function*() {
          return yield* CurrentPerson
        }))
  }))

/**
 * Resolves `CurrentPerson` and `CurrentSession` from the cookie or the bearer
 * token (ADR-0015). A cookie client whose session was just extended gets a
 * fresh cookie, so the browser keeps it as long as the server does.
 */
export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function*() {
    const identity = yield* Identity
    return Authentication.of({
      cookie: (httpEffect, { credential }) =>
        Effect.gen(function*() {
          const session = yield* identity.authenticate(credential)
          if (session.renewed) yield* setSessionCookie(credential)
          return yield* httpEffect.pipe(
            Effect.provideService(CurrentPerson, session.person),
            Effect.provideService(CurrentSession, { id: session.sessionId })
          )
        }),
      bearer: (httpEffect, { credential }) =>
        Effect.gen(function*() {
          const session = yield* identity.authenticate(credential)
          return yield* httpEffect.pipe(
            Effect.provideService(CurrentPerson, session.person),
            Effect.provideService(CurrentSession, { id: session.sessionId })
          )
        })
    })
  })
)
