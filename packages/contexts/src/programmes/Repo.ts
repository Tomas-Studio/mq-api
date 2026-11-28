import { Programme, ProgrammeId } from "@mequest/contract"
import { Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

// Queries on the programmes schema, run as mq_ctx_programmes inside
// `withTenant`, so only the current organisation's programmes are visible.

export const makeRepo = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  /** The programmes with these ids, sorted by name. Pass at least one id. */
  const findByIds = SqlSchema.findAll({
    Request: Schema.NonEmptyArray(ProgrammeId),
    Result: Programme,
    execute: (ids) => sql`SELECT id, name FROM programmes.programmes WHERE id IN ${sql.in(ids)} ORDER BY name, id`
  })

  return { findByIds } as const
})
