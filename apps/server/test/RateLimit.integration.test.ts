import { expect, layer } from "@effect/vitest"
import { TestDatabase } from "@mequest/db/testing"
import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { TestClock } from "effect/testing"
import { fromAddress, makeTestServer, nextClientAddress, TestServer } from "./TestServer.ts"

// Sign-in rate limits (ADR-0029). Each test uses addresses and emails of its own.

let visitors = 0
const newEmail = () => {
  visitors += 1
  return `visitor.${visitors}@example.com`
}

const newPerson = Effect.fn(function*() {
  const { owner } = yield* TestDatabase
  const email = newEmail()
  yield* owner`INSERT INTO identity.people (email, name) VALUES (${email}, 'Visitor')`
  return email
})

const post = Effect.fn(function*(path: string, address: string, body: object) {
  const request = yield* HttpClientRequest.post(path).pipe(fromAddress(address), HttpClientRequest.bodyJson(body))
  const response = yield* HttpClient.execute(request)
  const text = yield* response.text
  const json: unknown = text === "" ? undefined : JSON.parse(text)
  return { status: response.status, body: json, retryAfter: response.headers["retry-after"] }
})

const requestCode = (address: string, email: string) => post("/api/auth/email-code", address, { email })

const verify = (address: string, email: string) =>
  post("/api/auth/email-code/verify", address, { email, code: "123456", transport: "bearer" })

const TooManyRequestsBody = Schema.Struct({ _tag: Schema.Literal("TooManyRequests"), retryAfterSeconds: Schema.Int })

const expectLimited = (
  response: { readonly status: number; readonly body: unknown; readonly retryAfter: string | undefined },
  maxSeconds: number
) => {
  expect(response.status).toBe(429)
  const { retryAfterSeconds } = Schema.decodeUnknownSync(TooManyRequestsBody)(response.body)
  expect(retryAfterSeconds).toBeGreaterThan(0)
  expect(retryAfterSeconds).toBeLessThanOrEqual(maxSeconds)
  expect(response.retryAfter).toBe(String(retryAfterSeconds))
}

layer(TestServer, { timeout: "60 seconds" })("sign-in rate limits (ADR-0029)", (it) => {
  it.effect("allows 10 code requests per client address in 15 minutes", () =>
    Effect.gen(function*() {
      const address = nextClientAddress()
      for (let request = 1; request <= 10; request++) {
        expect((yield* requestCode(address, newEmail())).status).toBe(202)
      }
      expectLimited(yield* requestCode(address, newEmail()), 15 * 60)
      expect((yield* requestCode(nextClientAddress(), newEmail())).status).toBe(202)

      yield* TestClock.adjust("15 minutes")
      expect((yield* requestCode(address, newEmail())).status).toBe(202)
    }))

  it.effect("allows 5 code requests per email in an hour, from any address", () =>
    Effect.gen(function*() {
      const email = yield* newPerson()
      for (let request = 1; request <= 5; request++) {
        expect((yield* requestCode(nextClientAddress(), email)).status).toBe(202)
      }
      expectLimited(yield* requestCode(nextClientAddress(), email), 60 * 60)

      yield* TestClock.adjust("1 hour")
      expect((yield* requestCode(nextClientAddress(), email)).status).toBe(202)
    }))

  it.effect("limits an unknown email the same way, so a 429 reveals no account", () =>
    Effect.gen(function*() {
      const email = newEmail()
      for (let request = 1; request <= 5; request++) {
        expect((yield* requestCode(nextClientAddress(), email)).status).toBe(202)
      }
      expectLimited(yield* requestCode(nextClientAddress(), email), 60 * 60)
    }))

  it.effect("allows 30 code verifications per client address in 15 minutes", () =>
    Effect.gen(function*() {
      const address = nextClientAddress()
      for (let attempt = 1; attempt <= 30; attempt++) {
        expect((yield* verify(address, newEmail())).status).toBe(400)
      }
      expectLimited(yield* verify(address, newEmail()), 15 * 60)
      expect((yield* verify(nextClientAddress(), newEmail())).status).toBe(400)

      yield* TestClock.adjust("15 minutes")
      expect((yield* verify(address, newEmail())).status).toBe(400)
    }))

  it.effect("stores counters under hashed keys, with no email or address", () =>
    Effect.gen(function*() {
      const { owner } = yield* TestDatabase
      const rows = yield* owner<{ readonly row: string }>`SELECT to_jsonb(c)::text AS row FROM ratelimit.counters c`
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.filter(({ row }) => row.includes("@") || /\b10\.\d+\.\d+\.\d+\b/.test(row))).toEqual([])
    }))
})

// With no trusted proxies (the default), a client cannot dodge the per-address
// limit by sending a different X-Forwarded-For with each request.
layer(makeTestServer({ TRUSTED_PROXIES: "" }), { timeout: "60 seconds" })("without trusted proxies", (it) => {
  it.effect("ignores X-Forwarded-For and counts the transport peer", () =>
    Effect.gen(function*() {
      for (let request = 1; request <= 10; request++) {
        expect((yield* requestCode(nextClientAddress(), newEmail())).status).toBe(202)
      }
      expectLimited(yield* requestCode(nextClientAddress(), newEmail()), 15 * 60)
    }))
})
