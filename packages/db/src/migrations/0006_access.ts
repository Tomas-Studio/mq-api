import { Effect } from "effect"
import { SqlClient } from "effect/sql"

// Migrations are immutable once applied anywhere: inline SQL only, no shared helpers.

// Memberships (ADR-0014): who belongs to an organisation, and who holds which
// role in its programmes. Tenant data under RLS (ADR-0012), plus a SELECT-only
// policy that lets a person scope read the person's own rows in every
// organisation (ADR-0031).
export default Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  // Roles are cluster-wide: serialise concurrent migrators (deploys, test runs).
  yield* sql`SELECT pg_advisory_xact_lock(hashtext('mq_roles'))`
  yield* sql.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mq_ctx_access') THEN
        CREATE ROLE mq_ctx_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      ELSE
        ALTER ROLE mq_ctx_access NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      END IF;
    END $$`)
  yield* sql`GRANT mq_ctx_access TO mq_app WITH INHERIT FALSE, SET TRUE`

  // Like current_organisation_id: a transaction-local setting that has ended
  // reads as '' rather than NULL.
  yield* sql`
    CREATE FUNCTION tenancy.current_person_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT NULLIF(current_setting('app.person_id', true), '')::uuid $$`

  // Lets programme_roles reference a programme together with its organisation,
  // so a role can never point at another organisation's programme.
  yield* sql`
    ALTER TABLE programmes.programmes
    ADD CONSTRAINT programmes_organisation_id_id_key UNIQUE (organisation_id, id)`

  yield* sql`CREATE SCHEMA access`
  yield* sql`GRANT USAGE ON SCHEMA access TO mq_ctx_access, mq_system`

  yield* sql`
    CREATE TABLE access.org_memberships (
      organisation_id uuid NOT NULL REFERENCES org.organisations (id) ON DELETE CASCADE,
      person_id uuid NOT NULL REFERENCES identity.people (id) ON DELETE CASCADE,
      role text NOT NULL CHECK (role IN ('owner', 'billing', 'member')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (organisation_id, person_id)
    )`
  yield* sql`CREATE INDEX org_memberships_person_id_idx ON access.org_memberships (person_id)`

  // A person may hold several roles in one programme (instructor and reviewer).
  yield* sql`
    CREATE TABLE access.programme_roles (
      organisation_id uuid NOT NULL,
      programme_id uuid NOT NULL,
      person_id uuid NOT NULL REFERENCES identity.people (id) ON DELETE CASCADE,
      role text NOT NULL
        CHECK (role IN ('learner', 'lead', 'instructor', 'assistant', 'viewer', 'sponsor', 'reviewer')),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (programme_id, person_id, role),
      FOREIGN KEY (organisation_id, programme_id)
        REFERENCES programmes.programmes (organisation_id, id) ON DELETE CASCADE
    )`
  yield* sql`CREATE INDEX programme_roles_person_id_idx ON access.programme_roles (person_id)`
  yield* sql`
    CREATE INDEX programme_roles_organisation_id_person_id_idx
    ON access.programme_roles (organisation_id, person_id)`

  for (const table of ["access.org_memberships", "access.programme_roles"]) {
    yield* sql.unsafe(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`)
    yield* sql.unsafe(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`)
    yield* sql.unsafe(`
      CREATE POLICY tenant_isolation ON ${table}
      USING (organisation_id = tenancy.current_organisation_id())
      WITH CHECK (organisation_id = tenancy.current_organisation_id())`)
    yield* sql.unsafe(`
      CREATE POLICY own_rows ON ${table}
      FOR SELECT
      USING (person_id = tenancy.current_person_id())`)
    yield* sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO mq_ctx_access`)
    yield* sql.unsafe(`GRANT SELECT ON ${table} TO mq_system`)
  }
})
