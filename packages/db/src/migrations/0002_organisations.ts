import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  yield* sql`CREATE SCHEMA org`
  yield* sql`GRANT USAGE ON SCHEMA org TO mq_ctx_org, mq_system`

  yield* sql`
    CREATE TABLE org.organisations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`

  // The tenant root: a tenant sees its own organisation row only.
  yield* sql`ALTER TABLE org.organisations ENABLE ROW LEVEL SECURITY`
  yield* sql`ALTER TABLE org.organisations FORCE ROW LEVEL SECURITY`
  yield* sql`
    CREATE POLICY tenant_isolation ON org.organisations
    USING (id = tenancy.current_organisation_id())
    WITH CHECK (id = tenancy.current_organisation_id())`

  yield* sql`GRANT SELECT, UPDATE ON org.organisations TO mq_ctx_org`
  yield* sql`GRANT SELECT ON org.organisations TO mq_system`
})
