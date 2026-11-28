import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Migrations are immutable once applied anywhere: inline SQL only, no shared helpers.

// New rows get time-ordered UUIDv7 ids (ADR-0032). Existing rows keep theirs.
// uuidv7() needs Postgres 18.
export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  yield* sql`ALTER TABLE org.organisations ALTER COLUMN id SET DEFAULT uuidv7()`
  yield* sql`ALTER TABLE programmes.programmes ALTER COLUMN id SET DEFAULT uuidv7()`
  yield* sql`ALTER TABLE identity.people ALTER COLUMN id SET DEFAULT uuidv7()`
  yield* sql`ALTER TABLE identity.sessions ALTER COLUMN id SET DEFAULT uuidv7()`
})
