import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Migrations are immutable once applied anywhere: inline SQL only, no shared helpers.

const roles = [
  ["mq_app", "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"],
  ["mq_system", "LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS"],
  ["mq_ctx_org", "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"],
  ["mq_ctx_programmes", "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS"]
] as const

export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  // Roles are cluster-wide: serialise concurrent migrators (deploys, test runs).
  yield* sql`SELECT pg_advisory_xact_lock(hashtext('mq_roles'))`

  // Create, or bring an existing role back to the required attributes.
  // Login roles get no password here; the deployment pipeline sets it from Key Vault.
  for (const [role, attributes] of roles) {
    yield* sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${role}') THEN
          CREATE ROLE ${role} ${attributes};
        ELSE
          ALTER ROLE ${role} ${attributes};
        END IF;
      END $$`)
  }

  // mq_app may SET ROLE to a context role but inherits none of its grants.
  yield* sql`GRANT mq_ctx_org, mq_ctx_programmes TO mq_app WITH INHERIT FALSE, SET TRUE`

  // Policies compare against this, never against current_setting directly: once a
  // transaction-local setting ends it reads as '' rather than NULL.
  yield* sql`CREATE SCHEMA tenancy`
  yield* sql`GRANT USAGE ON SCHEMA tenancy TO PUBLIC`
  yield* sql`
    CREATE FUNCTION tenancy.current_organisation_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.organisation_id', true), '')::uuid $$`
})
