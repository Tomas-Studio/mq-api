import { assert, describe, expect, layer } from "@effect/vitest"
import { Mailbox } from "@mequest/contexts/notifications"
import { MqApi } from "@mequest/contract"
import { TestDatabase } from "@mequest/db/testing"
import { Effect, Option } from "effect"
import { Cookies, HttpClient, HttpClientRequest } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { TestClock } from "effect/testing"
import { TestServer } from "./TestServer.ts"

// Each test signs in a person of its own, so the 30-second resend cooldown and
// clock adjustments in one test never affect another.
let people = 0
const newPerson = Effect.fn(function*(name: string) {
  const { owner } = yield* TestDatabase
  people += 1
  const email = `${name.toLowerCase()}.${people}@example.com`
  yield* owner`INSERT INTO identity.people (email, name) VALUES (${email}, ${name})`
  return email
})

const suspend = Effect.fn(function*(email: string) {
  const { owner } = yield* TestDatabase
  yield* owner`UPDATE identity.people SET suspended_at = now() WHERE email = ${email}`
})

const mailTo = Effect.fn(function*(email: string) {
  const mailbox = yield* Mailbox
  return (yield* mailbox.sent).filter((message) => message.to === email)
})

const lastCodeSentTo = Effect.fn(function*(email: string) {
  const code = (yield* mailTo(email)).at(-1)?.text.match(/\b(\d{6})\b/)?.[1]
  assert(code !== undefined, `no code was emailed to ${email}`)
  return code
})

const wrong = (code: string) => (code === "000000" ? "111111" : "000000")

const api = HttpApiClient.make(MqApi)

const apiWithBearer = (token: string) =>
  HttpApiClient.make(MqApi, { transformClient: HttpClient.mapRequest(HttpClientRequest.bearerToken(token)) })

const requestCode = Effect.fn(function*(email: string) {
  const client = yield* api
  yield* client.identity.requestEmailCode({ payload: { email } })
})

const verify = Effect.fn(function*(email: string, code: string) {
  const client = yield* api
  return yield* client.identity.verifyEmailCode({ payload: { email, code, transport: "bearer" } })
})

/** Signs in as a mobile client would; returns the bearer token. */
const signInWithBearer = Effect.fn(function*(email: string) {
  yield* requestCode(email)
  const { token } = yield* verify(email, yield* lastCodeSentTo(email))
  assert(token !== undefined, "bearer sign-in returned no token")
  return token
})

const meWithBearer = Effect.fn(function*(token: string) {
  const client = yield* apiWithBearer(token)
  return yield* client.identity.me()
})

const verifyWithCookie = Effect.fn(function*(email: string, code: string) {
  const request = yield* HttpClientRequest.post("/api/auth/email-code/verify").pipe(
    HttpClientRequest.bodyJson({ email, code, transport: "cookie" })
  )
  return yield* HttpClient.execute(request)
})

layer(TestServer, { timeout: "60 seconds" })("email-code sign-in", (it) => {
  describe("requesting a code", () => {
    it.effect("emails a six-digit code to a known person", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Ada")
        yield* requestCode(email)
        expect(yield* lastCodeSentTo(email)).toMatch(/^\d{6}$/)
      }))

    it.effect("answers the same for an unknown email and sends nothing", () =>
      Effect.gen(function*() {
        yield* requestCode("nobody@example.com")
        expect(yield* mailTo("nobody@example.com")).toEqual([])
      }))

    // Raw JSON, as any client may send it: the generated client already refuses
    // an address with surrounding spaces before sending.
    it.effect("matches the email whatever its case and surrounding spaces", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Grace")
        const request = yield* HttpClientRequest.post("/api/auth/email-code").pipe(
          HttpClientRequest.bodyJson({ email: `  ${email.toUpperCase()} ` })
        )
        const response = yield* HttpClient.execute(request)
        expect(response.status).toBe(202)
        expect(yield* mailTo(email)).toHaveLength(1)
      }))

    it.effect("sends at most one code every 30 seconds, and a new code replaces the old one", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Alan")
        yield* requestCode(email)
        const first = yield* lastCodeSentTo(email)
        yield* requestCode(email)
        expect(yield* mailTo(email)).toHaveLength(1)

        yield* TestClock.adjust("31 seconds")
        yield* requestCode(email)
        expect(yield* mailTo(email)).toHaveLength(2)
        const second = yield* lastCodeSentTo(email)
        if (first !== second) {
          const error = yield* Effect.flip(verify(email, first))
          expect(error).toMatchObject({ _tag: "InvalidCode", reason: "incorrect" })
        }
        expect((yield* verify(email, second)).person.email).toBe(email)
      }))

    it.effect("sends nothing to a suspended person", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Mallory")
        yield* suspend(email)
        yield* requestCode(email)
        expect(yield* mailTo(email)).toEqual([])
      }))
  })

  describe("verifying a code", () => {
    it.effect("signs a mobile client in with a bearer token", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Katherine")
        const token = yield* signInWithBearer(email)
        const me = yield* meWithBearer(token)
        expect(me).toMatchObject({ email, name: "Katherine" })
      }))

    it.effect("signs a web client in with an httpOnly cookie and no token in the body", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Dorothy")
        yield* requestCode(email)
        const response = yield* verifyWithCookie(email, yield* lastCodeSentTo(email))
        expect(response.status).toBe(200)

        const body = yield* response.json
        expect(body).toMatchObject({ person: { email } })
        expect(body).not.toHaveProperty("token")

        const cookie = Option.getOrUndefined(Cookies.get(response.cookies, "mq_session"))
        assert(cookie !== undefined, "no mq_session cookie was set")
        expect(cookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" })

        const me = yield* HttpClient.execute(
          HttpClientRequest.get("/api/me").pipe(HttpClientRequest.setHeader("cookie", `mq_session=${cookie.value}`))
        )
        expect(me.status).toBe(200)
        expect(yield* me.json).toMatchObject({ email })
      }))

    it.effect("accepts a code only once", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Barbara")
        yield* requestCode(email)
        const code = yield* lastCodeSentTo(email)
        yield* verify(email, code)
        const error = yield* Effect.flip(verify(email, code))
        expect(error).toMatchObject({ _tag: "InvalidCode", reason: "incorrect" })
      }))

    it.effect("rejects a wrong code, and gives up on the code after five wrong attempts", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Frances")
        yield* requestCode(email)
        const code = yield* lastCodeSentTo(email)
        for (let attempt = 1; attempt <= 5; attempt++) {
          const error = yield* Effect.flip(verify(email, wrong(code)))
          expect(error).toMatchObject({ _tag: "InvalidCode", reason: "incorrect" })
        }
        const error = yield* Effect.flip(verify(email, code))
        expect(error).toMatchObject({ _tag: "InvalidCode", reason: "exhausted" })
      }))

    it.effect("expires a code after ten minutes", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Radia")
        yield* requestCode(email)
        const code = yield* lastCodeSentTo(email)
        yield* TestClock.adjust("10 minutes")
        const error = yield* Effect.flip(verify(email, code))
        expect(error).toMatchObject({ _tag: "InvalidCode", reason: "expired" })
      }))

    it.effect("gives an unknown email the same answer as a wrong code", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(verify("nobody@example.com", "123456"))
        expect(error).toMatchObject({ _tag: "InvalidCode", reason: "incorrect" })
      }))
  })

  describe("sessions (ADR-0015)", () => {
    it.effect("rejects a request without a session", () =>
      Effect.gen(function*() {
        const client = yield* api
        const error = yield* Effect.flip(client.identity.me())
        expect(error).toMatchObject({ _tag: "Unauthorized" })
      }))

    it.effect("rejects an unknown token", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(meWithBearer("not-a-session"))
        expect(error).toMatchObject({ _tag: "Unauthorized" })
      }))

    it.effect("stores only a hash of the session token", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Hedy")
        const token = yield* signInWithBearer(email)
        const { owner } = yield* TestDatabase
        const rows = yield* owner<{ readonly row: string }>`SELECT to_jsonb(s)::text AS row FROM identity.sessions s`
        expect(rows.length).toBeGreaterThan(0)
        expect(rows.filter(({ row }) => row.includes(token))).toEqual([])
      }))

    it.effect("signs out: the session stops working", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Margaret")
        const token = yield* signInWithBearer(email)
        const client = yield* apiWithBearer(token)
        yield* client.identity.signOut()
        const error = yield* Effect.flip(client.identity.me())
        expect(error).toMatchObject({ _tag: "Unauthorized" })
      }))

    it.effect("clears the cookie on sign-out", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Mary")
        yield* requestCode(email)
        const signedIn = yield* verifyWithCookie(email, yield* lastCodeSentTo(email))
        const session = Option.getOrThrow(Cookies.get(signedIn.cookies, "mq_session"))

        const response = yield* HttpClient.execute(
          HttpClientRequest.post("/api/auth/sign-out").pipe(
            HttpClientRequest.setHeader("cookie", `mq_session=${session.value}`)
          )
        )
        expect(response.status).toBe(204)
        const cleared = Option.getOrUndefined(Cookies.get(response.cookies, "mq_session"))
        assert(cleared !== undefined, "sign-out did not clear the cookie")
        expect(cleared.value).toBe("")
      }))

    it.effect("ends a session left unused for 30 days", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Annie")
        const token = yield* signInWithBearer(email)
        yield* TestClock.adjust("30 days")
        const error = yield* Effect.flip(meWithBearer(token))
        expect(error).toMatchObject({ _tag: "Unauthorized" })
      }))

    it.effect("keeps a session in use alive past 30 days", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Evelyn")
        const token = yield* signInWithBearer(email)
        yield* TestClock.adjust("20 days")
        yield* meWithBearer(token)
        yield* TestClock.adjust("20 days")
        expect(yield* meWithBearer(token)).toMatchObject({ email })
      }))

    it.effect("re-issues the cookie when a web session is extended", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Lynn")
        yield* requestCode(email)
        const signedIn = yield* verifyWithCookie(email, yield* lastCodeSentTo(email))
        const session = Option.getOrThrow(Cookies.get(signedIn.cookies, "mq_session"))
        const me = HttpClientRequest.get("/api/me").pipe(
          HttpClientRequest.setHeader("cookie", `mq_session=${session.value}`)
        )

        const early = yield* HttpClient.execute(me)
        expect(Option.isNone(Cookies.get(early.cookies, "mq_session"))).toBe(true)

        yield* TestClock.adjust("20 days")
        const late = yield* HttpClient.execute(me)
        const renewed = Option.getOrUndefined(Cookies.get(late.cookies, "mq_session"))
        assert(renewed !== undefined, "the extended session's cookie was not re-issued")
        expect(renewed.value).toBe(session.value)
        expect(renewed.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" })
      }))

    it.effect("ends every session of a person who is suspended", () =>
      Effect.gen(function*() {
        const email = yield* newPerson("Eve")
        const token = yield* signInWithBearer(email)
        yield* suspend(email)
        const error = yield* Effect.flip(meWithBearer(token))
        expect(error).toMatchObject({ _tag: "Unauthorized" })
      }))
  })
})
