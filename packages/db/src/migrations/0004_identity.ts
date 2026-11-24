import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Migrations are immutable once applied anywhere: inline SQL only, no shared helpers.

// Identities are global (ADR-0012, ADR-0014): no organisation_id and no RLS.
// Only mq_ctx_identity can reach this schema, and findRlsViolations lists these
// tables as deliberately global.
export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  // Roles are cluster-wide: serialise concurrent migrators (deploys, test runs).
  yield* sql`SELECT pg_advisory_xact_lock(hashtext('mq_roles'))`
  yield* sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mq_ctx_identity') THEN
        CREATE ROLE mq_ctx_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ELSE
        ALTER ROLE mq_ctx_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END $$`)
  yield* sql`GRANT mq_ctx_identity TO mq_app WITH INHERIT FALSE, SET TRUE`

  yield* sql`CREATE SCHEMA identity`
  yield* sql`GRANT USAGE ON SCHEMA identity TO mq_ctx_identity`

  yield* sql`
    CREATE TABLE identity.people (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
      name text NOT NULL,
      suspended_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`

  // One live code per person; a new request replaces it. code_hash is an HMAC of
  // the person id and the code, so a leaked row cannot be brute-forced offline.
  yield* sql`
    CREATE TABLE identity.email_codes (
      person_id uuid PRIMARY KEY REFERENCES identity.people (id) ON DELETE CASCADE,
      code_hash text NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL
    )`

  // token_hash is the SHA-256 of the opaque session token, which is never stored (ADR-0015).
  yield* sql`
    CREATE TABLE identity.sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      person_id uuid NOT NULL REFERENCES identity.people (id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL
    )`
  yield* sql`CREATE INDEX sessions_person_id_idx ON identity.sessions (person_id)`

  // People are created by enrolment, invitation and the ETL, not by sign-in.
  yield* sql`GRANT SELECT ON identity.people TO mq_ctx_identity`
  yield* sql`GRANT SELECT, INSERT, UPDATE, DELETE ON identity.email_codes, identity.sessions TO mq_ctx_identity`
})
