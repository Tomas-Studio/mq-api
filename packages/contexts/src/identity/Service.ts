import { InvalidCode, type Person, type SessionId, Unauthorized } from "@mequest/contract"
import { withGlobal } from "@mequest/db"
import { Clock, Config, Context, Duration, Effect, Layer, Option, Redacted } from "effect"
import { SqlClient } from "effect/sql"
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { Mailer } from "../notifications/index.ts"
import { makeRepo } from "./Repo.ts"

// Email-code rules carried over from legacy sign-in.
export const CodeLifetime = Duration.minutes(10)
const ResendCooldown = Duration.seconds(30)
const MaxCodeAttempts = 5

// Sessions (ADR-0015): opaque, stored hashed, 30 days, extended when used in their second half.
export const SessionLifetime = Duration.days(30)
const RenewWithin = Duration.days(15)

const currentDate = Effect.map(Clock.currentTimeMillis, (millis) => new Date(millis))
const plus = (date: Date, duration: Duration.Duration) => new Date(date.getTime() + Duration.toMillis(duration))
const minus = (date: Date, duration: Duration.Duration) => new Date(date.getTime() - Duration.toMillis(duration))

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

type Verification =
  | { readonly _tag: "Rejected"; readonly reason: InvalidCode["reason"] }
  | { readonly _tag: "Accepted"; readonly person: Person; readonly sessionId: SessionId }

const rejected = (reason: InvalidCode["reason"]): Verification => ({ _tag: "Rejected", reason })

export interface SignedInSession {
  readonly person: Person
  readonly sessionId: SessionId
  readonly token: Redacted.Redacted<string>
  readonly expiresAt: Date
}

export interface AuthenticatedSession {
  readonly person: Person
  readonly sessionId: SessionId
  /** The session was extended by this request; a cookie client should get a fresh cookie. */
  readonly renewed: boolean
}

/** Email-code sign-in and session resolution (ADR-0014, ADR-0015). */
export class Identity extends Context.Service<Identity>()("mq/Identity", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* makeRepo
    const mailer = yield* Mailer
    const codeSecret = yield* Config.Redacted("IDENTITY_CODE_SECRET")

    // Identities are global (ADR-0012). Database failures are defects: callers
    // only ever see the declared errors.
    const inIdentity = <A, E>(self: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      withGlobal("mq_ctx_identity")(self).pipe(Effect.provideService(SqlClient.SqlClient, sql), Effect.orDie)

    // HMAC bound to the person, so a leaked row cannot be brute-forced offline.
    const hashCode = (personId: string, code: string) =>
      createHmac("sha256", Redacted.value(codeSecret)).update(`${personId}:${code}`).digest("hex")

    /**
     * Emails a new code to the person with this email, if there is an active
     * one and no code was sent in the last 30 seconds. Never says which.
     */
    const requestEmailCode = Effect.fn("Identity.requestEmailCode")(function*(email: string) {
      const issuedAt = yield* currentDate
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0")

      const recipient = yield* inIdentity(Effect.gen(function*() {
        const person = yield* repo.findActivePerson(email)
        if (Option.isNone(person)) return Option.none<Person>()
        const stored = yield* repo.storeCode({
          personId: person.value.id,
          codeHash: hashCode(person.value.id, code),
          issuedAt,
          expiresAt: plus(issuedAt, CodeLifetime),
          resendAfter: minus(issuedAt, ResendCooldown)
        })
        return stored ? person : Option.none<Person>()
      }))
      if (Option.isNone(recipient)) return

      // Logged, not reported: an error only for known emails would reveal who has an account.
      yield* mailer.send({
        to: recipient.value.email,
        subject: "Your MEQuest sign-in code",
        text: `Your MEQuest sign-in code is ${code}. It expires in 10 minutes.`
      }).pipe(Effect.catchTag("MailError", (error) => Effect.logError("Sign-in code email failed", error)))
    })

    /**
     * Exchanges a code for a new session. The code is single-use, expires after
     * 10 minutes, and is given up after five wrong attempts.
     */
    const verifyEmailCode = Effect.fn("Identity.verifyEmailCode")(
      function*(input: { readonly email: string; readonly code: string }) {
        const at = yield* currentDate
        const expiresAt = plus(at, SessionLifetime)
        const token = randomBytes(32).toString("base64url")

        // Rejections are returned, not failed, so the transaction commits the
        // attempt count and code deletions they make.
        const result = yield* inIdentity(Effect.gen(function*() {
          const person = yield* repo.findActivePerson(input.email)
          if (Option.isNone(person)) return rejected("incorrect")
          const personId = person.value.id

          const stored = yield* repo.lockCode({ personId, at })
          if (Option.isNone(stored)) return rejected("incorrect")
          if (stored.value.expired) {
            yield* repo.deleteCode(personId)
            return rejected("expired")
          }
          if (stored.value.attempts >= MaxCodeAttempts) {
            yield* repo.deleteCode(personId)
            return rejected("exhausted")
          }
          if (!sameHash(hashCode(personId, input.code), stored.value.codeHash)) {
            yield* repo.recordFailedAttempt(personId)
            return rejected("incorrect")
          }

          yield* repo.deleteCode(personId)
          const session = yield* repo.createSession({
            personId,
            tokenHash: hashToken(token),
            createdAt: at,
            expiresAt
          })
          const accepted: Verification = { _tag: "Accepted", person: person.value, sessionId: session.id }
          return accepted
        }))

        if (result._tag === "Rejected") return yield* new InvalidCode({ reason: result.reason })
        const signedIn: SignedInSession = {
          person: result.person,
          sessionId: result.sessionId,
          token: Redacted.make(token),
          expiresAt
        }
        return signedIn
      }
    )

    /** Resolves a session token, extending the session when it is in its second half. */
    const authenticate = Effect.fn("Identity.authenticate")(function*(credential: Redacted.Redacted<string>) {
      const token = Redacted.value(credential)
      if (token === "") return yield* new Unauthorized()
      const at = yield* currentDate

      const found = yield* inIdentity(Effect.gen(function*() {
        const session = yield* repo.findSession({
          tokenHash: hashToken(token),
          at,
          renewBefore: plus(at, RenewWithin)
        })
        if (Option.isSome(session) && session.value.renew) {
          yield* repo.extendSession(session.value.sessionId, plus(at, SessionLifetime))
        }
        return session
      }))
      if (Option.isNone(found)) return yield* new Unauthorized()

      const { email, id, name, renew, sessionId } = found.value
      const session: AuthenticatedSession = { person: { id, email, name }, sessionId, renewed: renew }
      return session
    })

    /** Ends the session at once (ADR-0015: revocation deletes the row). */
    const signOut = Effect.fn("Identity.signOut")(function*(sessionId: SessionId) {
      yield* inIdentity(repo.deleteSession(sessionId))
    })

    return { requestEmailCode, verifyEmailCode, authenticate, signOut } as const
  })
}) {
  static readonly layer = Layer.effect(Identity, Identity.make)
}
