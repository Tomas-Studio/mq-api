import { PersonId, SessionId } from "@mequest/contract"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

// Queries on the identity schema. Callers run them inside
// `withGlobal("mq_ctx_identity")`; times come from the caller's Clock, never `now()`.

const PersonRow = Schema.Struct({ id: PersonId, email: Schema.String, name: Schema.String })

const CodeRow = Schema.Struct({ codeHash: Schema.String, attempts: Schema.Int, expired: Schema.Boolean })

const SessionRow = Schema.Struct({
  sessionId: SessionId,
  renew: Schema.Boolean,
  id: PersonId,
  email: Schema.String,
  name: Schema.String
})

export const makeRepo = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  const findActivePerson = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: PersonRow,
    execute: (email) => sql`SELECT id, email, name FROM identity.people WHERE email = ${email} AND suspended_at IS NULL`
  })

  /**
   * Stores a new code for the person, replacing any earlier one, unless the
   * earlier one was issued after `resendAfter`. Returns whether it was stored.
   */
  const storeCode = (input: {
    readonly personId: PersonId
    readonly codeHash: string
    readonly issuedAt: Date
    readonly expiresAt: Date
    readonly resendAfter: Date
  }) =>
    sql`
      INSERT INTO identity.email_codes (person_id, code_hash, attempts, created_at, expires_at)
      VALUES (${input.personId}, ${input.codeHash}, 0, ${input.issuedAt}, ${input.expiresAt})
      ON CONFLICT (person_id) DO UPDATE
        SET code_hash = excluded.code_hash, attempts = 0,
            created_at = excluded.created_at, expires_at = excluded.expires_at
        WHERE identity.email_codes.created_at <= ${input.resendAfter}
      RETURNING person_id`.pipe(Effect.map((rows) => rows.length > 0))

  /** The person's current code, locked until the transaction ends. */
  const lockCode = SqlSchema.findOneOption({
    Request: Schema.Struct({ personId: PersonId, at: Schema.Date }),
    Result: CodeRow,
    execute: ({ at, personId }) =>
      sql`
        SELECT code_hash AS "codeHash", attempts, expires_at <= ${at} AS expired
        FROM identity.email_codes WHERE person_id = ${personId}
        FOR UPDATE`
  })

  const deleteCode = (personId: PersonId) => sql`DELETE FROM identity.email_codes WHERE person_id = ${personId}`

  const recordFailedAttempt = (personId: PersonId) =>
    sql`UPDATE identity.email_codes SET attempts = attempts + 1 WHERE person_id = ${personId}`

  const createSession = SqlSchema.findOne({
    Request: Schema.Struct({
      personId: PersonId,
      tokenHash: Schema.String,
      createdAt: Schema.Date,
      expiresAt: Schema.Date
    }),
    Result: Schema.Struct({ id: SessionId }),
    execute: (input) =>
      sql`
        INSERT INTO identity.sessions (person_id, token_hash, created_at, expires_at)
        VALUES (${input.personId}, ${input.tokenHash}, ${input.createdAt}, ${input.expiresAt})
        RETURNING id`
  })

  /** A live session of an active person, and whether it is due for renewal. */
  const findSession = SqlSchema.findOneOption({
    Request: Schema.Struct({ tokenHash: Schema.String, at: Schema.Date, renewBefore: Schema.Date }),
    Result: SessionRow,
    execute: ({ at, renewBefore, tokenHash }) =>
      sql`
        SELECT s.id AS "sessionId", s.expires_at < ${renewBefore} AS renew, p.id, p.email, p.name
        FROM identity.sessions s
        JOIN identity.people p ON p.id = s.person_id
        WHERE s.token_hash = ${tokenHash} AND s.expires_at > ${at} AND p.suspended_at IS NULL`
  })

  const extendSession = (sessionId: SessionId, expiresAt: Date) =>
    sql`UPDATE identity.sessions SET expires_at = ${expiresAt} WHERE id = ${sessionId}`

  const deleteSession = (sessionId: SessionId) => sql`DELETE FROM identity.sessions WHERE id = ${sessionId}`

  return {
    findActivePerson,
    storeCode,
    lockCode,
    deleteCode,
    recordFailedAttempt,
    createSession,
    findSession,
    extendSession,
    deleteSession
  } as const
})
