import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  yield* sql`CREATE SCHEMA programmes`
  yield* sql`GRANT USAGE ON SCHEMA programmes TO mq_ctx_programmes, mq_system`

  yield* sql`
    CREATE TABLE programmes.programmes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organisation_id uuid NOT NULL REFERENCES org.organisations (id),
      name text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`
  yield* sql`CREATE INDEX programmes_organisation_id_idx ON programmes.programmes (organisation_id)`

  yield* sql`ALTER TABLE programmes.programmes ENABLE ROW LEVEL SECURITY`
  yield* sql`ALTER TABLE programmes.programmes FORCE ROW LEVEL SECURITY`
  yield* sql`
    CREATE POLICY tenant_isolation ON programmes.programmes
    USING (organisation_id = tenancy.current_organisation_id())
    WITH CHECK (organisation_id = tenancy.current_organisation_id())`

  yield* sql`GRANT SELECT, INSERT, UPDATE, DELETE ON programmes.programmes TO mq_ctx_programmes`
  yield* sql`GRANT SELECT ON programmes.programmes TO mq_system`
})
