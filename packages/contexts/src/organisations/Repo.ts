import { Organisation, OrganisationId } from "@mequest/contract"
import { Effect } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

// Queries on the org schema, run as mq_ctx_org inside `withTenant`. The tenant
// root's policy shows only the scope's own organisation (ADR-0012).

export const makeRepo = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  const find = SqlSchema.findOneOption({
    Request: OrganisationId,
    Result: Organisation,
    execute: (id) => sql`SELECT id, slug, name FROM org.organisations WHERE id = ${id}`
  })

  return { find } as const
})
