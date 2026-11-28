import { assert } from "@effect/vitest"
import { Mailbox } from "@mequest/contexts/notifications"
import { MqApi, type PersonId } from "@mequest/contract"
import { TestDatabase } from "@mequest/db/testing"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { fromNewAddress } from "./TestServer.ts"

// Sign-in helpers for server tests. Each person gets an email of their own, so
// the 30-second resend cooldown and clock adjustments in one test never affect
// another.

let people = 0

/** Adds a person, written as the schema owner. */
export const newPerson = Effect.fn(function*(name: string) {
  const { owner } = yield* TestDatabase
  people += 1
  const email = `${name.toLowerCase()}.${people}@example.com`
  const [row] = yield* owner<{ readonly id: PersonId }>`
    INSERT INTO identity.people (email, name) VALUES (${email}, ${name}) RETURNING id`
  assert(row !== undefined)
  return { id: row.id, email }
})

export const mailTo = Effect.fn(function*(email: string) {
  const mailbox = yield* Mailbox
  return (yield* mailbox.sent).filter((message) => message.to === email)
})

export const lastCodeSentTo = Effect.fn(function*(email: string) {
  const code = (yield* mailTo(email)).at(-1)?.text.match(/\b(\d{6})\b/)?.[1]
  assert(code !== undefined, `no code was emailed to ${email}`)
  return code
})

// Every request comes from a new client address, so only per-email limits
// apply; RateLimit.integration.test.ts covers the per-address ones.
export const api = HttpApiClient.make(MqApi, { transformClient: HttpClient.mapRequest(fromNewAddress) })

export const apiWithBearer = (token: string) =>
  HttpApiClient.make(MqApi, {
    transformClient: HttpClient.mapRequest((request) => fromNewAddress(HttpClientRequest.bearerToken(request, token)))
  })

export const requestCode = Effect.fn(function*(email: string) {
  const client = yield* api
  yield* client.identity.requestEmailCode({ payload: { email } })
})

export const verify = Effect.fn(function*(email: string, code: string) {
  const client = yield* api
  return yield* client.identity.verifyEmailCode({ payload: { email, code, transport: "bearer" } })
})

/** Signs in as a mobile client would; returns the bearer token. */
export const signInWithBearer = Effect.fn(function*(email: string) {
  yield* requestCode(email)
  const { token } = yield* verify(email, yield* lastCodeSentTo(email))
  assert(token !== undefined, "bearer sign-in returned no token")
  return token
})

/** Signs `email` in and returns an API client that sends the bearer token. */
export const signedInApi = Effect.fn(function*(email: string) {
  return yield* apiWithBearer(yield* signInWithBearer(email))
})
