import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Migrations are immutable once applied anywhere: inline SQL only, no shared helpers.

// Fixed-window counters for Effect's RateLimiter (ADR-0029). Global: no
// organisation_id and no RLS. Only mq_ctx_ratelimit can reach this schema, and
// keys are SHA-256 hashes, so no email or IP address is stored.
export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  // Roles are cluster-wide: serialise concurrent migrators (deploys, test runs).
  yield* sql`SELECT pg_advisory_xact_lock(hashtext('mq_roles'))`
  yield* sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mq_ctx_ratelimit') THEN
        CREATE ROLE mq_ctx_ratelimit NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ELSE
        ALTER ROLE mq_ctx_ratelimit NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END $$`)
  yield* sql`GRANT mq_ctx_ratelimit TO mq_app WITH INHERIT FALSE, SET TRUE`

  yield* sql`CREATE SCHEMA ratelimit`
  yield* sql`GRANT USAGE ON SCHEMA ratelimit TO mq_ctx_ratelimit`

  yield* sql`
    CREATE TABLE ratelimit.counters (
      key_hash text PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
      count integer NOT NULL,
      expires_at timestamptz NOT NULL
    )`
  // For the purge of expired counters the worker will run.
  yield* sql`CREATE INDEX counters_expires_at_idx ON ratelimit.counters (expires_at)`

  yield* sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ratelimit.counters TO mq_ctx_ratelimit`
})
