import { assert, describe, expect, layer } from "@effect/vitest"
import type { OrganisationId, PersonId } from "@mequest/contract"
import { Context, Data, Effect, Exit, Layer } from "effect"
import { SqlClient, type SqlError } from "effect/sql"
import { findRlsViolations, type RlsViolation, SystemSql, withGlobal, withPerson, withTenant } from "../src/index.ts"
import { TestDatabase } from "../src/testing/index.ts"

interface Tenants {
  readonly acme: OrganisationId
  readonly globex: OrganisationId
  readonly ada: PersonId
  readonly bob: PersonId
}

// Two organisations with one programme each, and two people, written as the
// schema owner. Ada owns Acme and is a learner in Globex's programme; Bob is a
// member of Globex.
class Fixtures extends Context.Service<Fixtures, Tenants>()("test/Fixtures") {
  static readonly layer = Layer.effect(
    Fixtures,
    Effect.gen(function*() {
      const { owner: sql } = yield* TestDatabase
      const [acme, globex] = yield* sql<{ readonly id: OrganisationId }>`
        INSERT INTO org.organisations (slug, name)
        VALUES ('acme', 'Acme Academy'), ('globex', 'Globex Institute')
        RETURNING id`
      assert(acme !== undefined && globex !== undefined)
      const [, finance] = yield* sql<{ readonly id: string }>`
        INSERT INTO programmes.programmes (organisation_id, name)
        VALUES (${acme.id}, 'Acme Leadership'), (${globex.id}, 'Globex Finance')
        RETURNING id`
      const [ada, bob] = yield* sql<{ readonly id: PersonId }>`
        INSERT INTO identity.people (email, name)
        VALUES ('ada@example.com', 'Ada Lovelace'), ('bob@example.com', 'Bob Kahn')
        RETURNING id`
      assert(finance !== undefined && ada !== undefined && bob !== undefined)
      yield* sql`
        INSERT INTO access.org_memberships (organisation_id, person_id, role)
        VALUES (${acme.id}, ${ada.id}, 'owner'), (${globex.id}, ${bob.id}, 'member')`
      yield* sql`
        INSERT INTO access.programme_roles (organisation_id, programme_id, person_id, role)
        VALUES (${globex.id}, ${finance.id}, ${ada.id}, 'learner')`
      return { acme: acme.id, globex: globex.id, ada: ada.id, bob: bob.id }
    })
  )
}

const programmeNames = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly name: string }>`SELECT name FROM programmes.programmes ORDER BY name`
  return rows.map((row) => row.name)
})

const peopleEmails = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly email: string }>`SELECT email FROM identity.people ORDER BY email`
  return rows.map((row) => row.email)
})

const connectionState = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const [state] = yield* sql<
    { readonly role: string; readonly tenant: string | null; readonly person: string | null }
  >`
    SELECT
      current_user AS role,
      NULLIF(current_setting('app.organisation_id', true), '') AS tenant,
      NULLIF(current_setting('app.person_id', true), '') AS person`
  return state
})

interface MembershipRow {
  readonly organisationId: OrganisationId
  readonly personId: PersonId
  readonly role: string
}

/** Every membership and programme role the current scope can see. */
const visibleMemberships = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const organisations = yield* sql<MembershipRow>`
    SELECT organisation_id AS "organisationId", person_id AS "personId", role
    FROM access.org_memberships ORDER BY role`
  const programmes = yield* sql<MembershipRow>`
    SELECT organisation_id AS "organisationId", person_id AS "personId", role
    FROM access.programme_roles ORDER BY role`
  return { organisations, programmes }
})

class RolledBack extends Data.TaggedError("RolledBack")<{ readonly violations: ReadonlyArray<RlsViolation> }> {}

/**
 * Applies `change` as the schema owner, checks the invariants, and rolls the
 * change back, so other tests in this file never see it.
 */
const violationsAfter = (change: Effect.Effect<unknown, SqlError.SqlError, SqlClient.SqlClient>) =>
  Effect.gen(function*() {
    const { owner } = yield* TestDatabase
    return yield* owner.withTransaction(
      Effect.gen(function*() {
        yield* change
        return yield* new RolledBack({ violations: yield* findRlsViolations })
      })
    ).pipe(
      Effect.catchTag("RolledBack", (rolledBack) => Effect.succeed(rolledBack.violations)),
      Effect.provideService(SqlClient.SqlClient, owner)
    )
  })

layer(Fixtures.layer.pipe(Layer.provideMerge(TestDatabase.layer)), { timeout: "60 seconds" })("tenancy", (it) => {
  describe("roles and policies (ADR-0012)", () => {
    it.effect("leave no table unprotected and no runtime role able to bypass RLS", () =>
      Effect.gen(function*() {
        const { owner } = yield* TestDatabase
        const violations = yield* findRlsViolations.pipe(Effect.provideService(SqlClient.SqlClient, owner))
        expect(violations).toEqual([])
      }))

    // ADR-0031: a second policy may widen what a scope can read, never what it can write.
    it.effect("require a tenant_isolation policy on every tenant table", () =>
      Effect.gen(function*() {
        const { owner: sql } = yield* TestDatabase
        const violations = yield* violationsAfter(
          sql`ALTER POLICY tenant_isolation ON access.org_memberships RENAME TO isolation`
        )
        expect(violations).toEqual([
          { subject: "access.org_memberships", problem: "no tenant_isolation policy" },
          { subject: "access.org_memberships", problem: "policy isolation is not FOR SELECT" }
        ])
      }))

    it.effect("allow any other policy for SELECT only", () =>
      Effect.gen(function*() {
        const { owner: sql } = yield* TestDatabase
        const violations = yield* violationsAfter(sql`
          CREATE POLICY own_rows_update ON access.org_memberships
          FOR UPDATE USING (person_id = tenancy.current_person_id())`)
        expect(violations).toEqual([
          { subject: "access.org_memberships", problem: "policy own_rows_update is not FOR SELECT" }
        ])
      }))

    it.effect("deny mq_app table access outside a tenant scope", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(programmeNames)
        expect(Exit.isFailure(exit)).toBe(true)
      }))
  })

  describe("withTenant", () => {
    it.effect("returns only the tenant's own rows", () =>
      Effect.gen(function*() {
        const { acme, globex } = yield* Fixtures
        expect(yield* withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(programmeNames))
          .toEqual(["Acme Leadership"])
        expect(yield* withTenant({ organisationId: globex, role: "mq_ctx_programmes" })(programmeNames))
          .toEqual(["Globex Finance"])
      }))

    it.effect("returns nothing for another tenant's rows, even when asked by id", () =>
      Effect.gen(function*() {
        const { acme, globex } = yield* Fixtures
        const sql = yield* SqlClient.SqlClient
        const rows = yield* withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(
          sql`SELECT id FROM programmes.programmes WHERE organisation_id = ${globex}`
        )
        expect(rows).toEqual([])
      }))

    it.effect("rejects writes into another tenant", () =>
      Effect.gen(function*() {
        const { acme, globex } = yield* Fixtures
        const sql = yield* SqlClient.SqlClient
        const exit = yield* Effect.exit(
          withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(
            sql`INSERT INTO programmes.programmes (organisation_id, name) VALUES (${globex}, 'Planted')`
          )
        )
        expect(Exit.isFailure(exit)).toBe(true)
      }))

    it.effect("leaves no tenant setting or role behind on the pooled connection", () =>
      Effect.gen(function*() {
        const { acme } = yield* Fixtures
        yield* withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(programmeNames)
        expect(yield* connectionState).toEqual({ role: "mq_app", tenant: null, person: null })
      }))

    it.effect("restores the outer context role after a nested scope for the same tenant", () =>
      Effect.gen(function*() {
        const { acme } = yield* Fixtures
        const sql = yield* SqlClient.SqlClient
        const currentRole = Effect.map(sql<{ readonly role: string }>`SELECT current_user AS role`, (rows) =>
          rows[0]?.role)
        const roles = yield* withTenant({ organisationId: acme, role: "mq_ctx_org" })(
          Effect.gen(function*() {
            const inner = yield* withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(currentRole)
            const outer = yield* currentRole
            return { inner, outer }
          })
        )
        expect(roles).toEqual({ inner: "mq_ctx_programmes", outer: "mq_ctx_org" })
      }))

    it.effect("refuses to nest a scope for a different tenant", () =>
      Effect.gen(function*() {
        const { acme, globex } = yield* Fixtures
        const exit = yield* Effect.exit(
          withTenant({ organisationId: acme, role: "mq_ctx_org" })(
            withTenant({ organisationId: globex, role: "mq_ctx_programmes" })(programmeNames)
          )
        )
        expect(Exit.hasDies(exit)).toBe(true)
      }))
  })

  // Identities are global (ADR-0012): their schema has no RLS, and only its
  // context role can reach it.
  describe("withGlobal", () => {
    it.effect("denies mq_app the identity schema outside a scope", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(peopleEmails)
        expect(Exit.isFailure(exit)).toBe(true)
      }))

    it.effect("reads global rows as the context role, with no tenant set", () =>
      Effect.gen(function*() {
        expect(yield* withGlobal("mq_ctx_identity")(peopleEmails)).toEqual(["ada@example.com", "bob@example.com"])
        expect(yield* withGlobal("mq_ctx_identity")(connectionState))
          .toEqual({ role: "mq_ctx_identity", tenant: null, person: null })
      }))

    it.effect("keeps contexts apart: another context's role cannot read the schema", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(withGlobal("mq_ctx_programmes")(peopleEmails))
        expect(Exit.isFailure(exit)).toBe(true)
      }))

    it.effect("leaves no role behind on the pooled connection", () =>
      Effect.gen(function*() {
        yield* withGlobal("mq_ctx_identity")(peopleEmails)
        expect(yield* connectionState).toEqual({ role: "mq_app", tenant: null, person: null })
      }))

    it.effect("switches role inside a tenant scope and restores it afterwards", () =>
      Effect.gen(function*() {
        const { acme } = yield* Fixtures
        const result = yield* withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(
          Effect.gen(function*() {
            const people = yield* withGlobal("mq_ctx_identity")(peopleEmails)
            const programmes = yield* programmeNames
            return { people, programmes }
          })
        )
        expect(result).toEqual({ people: ["ada@example.com", "bob@example.com"], programmes: ["Acme Leadership"] })
      }))

    it.effect("refuses to open a tenant scope inside a global one", () =>
      Effect.gen(function*() {
        const { acme } = yield* Fixtures
        const exit = yield* Effect.exit(
          withGlobal("mq_ctx_identity")(
            withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(programmeNames)
          )
        )
        expect(Exit.hasDies(exit)).toBe(true)
      }))
  })

  // ADR-0031: a person scope sees the rows that name the person, in every
  // organisation, and can write nothing.
  describe("withPerson", () => {
    it.effect("reads the person's own membership rows in every organisation, and no one else's", () =>
      Effect.gen(function*() {
        const { acme, globex, ada } = yield* Fixtures
        expect(yield* withPerson({ personId: ada, role: "mq_ctx_access" })(visibleMemberships)).toEqual({
          organisations: [{ organisationId: acme, personId: ada, role: "owner" }],
          programmes: [{ organisationId: globex, personId: ada, role: "learner" }]
        })
      }))

    it.effect("sets the person, not an organisation", () =>
      Effect.gen(function*() {
        const { ada } = yield* Fixtures
        expect(yield* withPerson({ personId: ada, role: "mq_ctx_access" })(connectionState))
          .toEqual({ role: "mq_ctx_access", tenant: null, person: ada })
      }))

    it.effect("cannot add, change or remove rows, even the person's own", () =>
      Effect.gen(function*() {
        const { globex, ada } = yield* Fixtures
        const sql = yield* SqlClient.SqlClient
        const asAda = withPerson({ personId: ada, role: "mq_ctx_access" })
        const insert = yield* Effect.exit(asAda(sql`
          INSERT INTO access.org_memberships (organisation_id, person_id, role) VALUES (${globex}, ${ada}, 'owner')`))
        expect(Exit.isFailure(insert)).toBe(true)
        const updated = yield* asAda(sql`
          UPDATE access.org_memberships SET role = 'member' WHERE person_id = ${ada} RETURNING role`)
        const deleted = yield* asAda(sql`
          DELETE FROM access.programme_roles WHERE person_id = ${ada} RETURNING role`)
        expect({ updated, deleted }).toEqual({ updated: [], deleted: [] })
        expect((yield* asAda(visibleMemberships)).organisations).toMatchObject([{ role: "owner" }])
      }))

    it.effect("leaves no person setting or role behind on the pooled connection", () =>
      Effect.gen(function*() {
        const { ada } = yield* Fixtures
        yield* withPerson({ personId: ada, role: "mq_ctx_access" })(visibleMemberships)
        expect(yield* connectionState).toEqual({ role: "mq_app", tenant: null, person: null })
      }))

    it.effect("refuses to nest with any other scope, in either direction", () =>
      Effect.gen(function*() {
        const { acme, ada } = yield* Fixtures
        const asAda = withPerson({ personId: ada, role: "mq_ctx_access" })
        const inAcme = withTenant({ organisationId: acme, role: "mq_ctx_access" })
        const dies = <A, E, R>(self: Effect.Effect<A, E, R>) =>
          Effect.map(Effect.exit(self), (exit) => Exit.hasDies(exit))
        expect([
          yield* dies(asAda(inAcme(visibleMemberships))),
          yield* dies(inAcme(asAda(visibleMemberships))),
          yield* dies(asAda(withGlobal("mq_ctx_identity")(peopleEmails))),
          yield* dies(withGlobal("mq_ctx_identity")(asAda(visibleMemberships))),
          yield* dies(asAda(asAda(visibleMemberships)))
        ]).toEqual([true, true, true, true, true])
      }))
  })

  describe("SystemSql (ADR-0013)", () => {
    it.effect("reads across tenants", () =>
      Effect.gen(function*() {
        const system = yield* SystemSql
        const rows = yield* system<{ readonly name: string }>`SELECT name FROM programmes.programmes ORDER BY name`
        expect(rows.map((row) => row.name)).toEqual(["Acme Leadership", "Globex Finance"])
      }))
  })
})
