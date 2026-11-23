import { assert, describe, expect, layer } from "@effect/vitest"
import type { OrganisationId } from "@mequest/contract"
import { Context, Effect, Exit, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { findRlsViolations, SystemSql, withTenant } from "../src/index.ts"
import { TestDatabase } from "../src/testing/index.ts"

interface Tenants {
  readonly acme: OrganisationId
  readonly globex: OrganisationId
}

// Two organisations with one programme each, written as the schema owner.
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
      yield* sql`
        INSERT INTO programmes.programmes (organisation_id, name)
        VALUES (${acme.id}, 'Acme Leadership'), (${globex.id}, 'Globex Finance')`
      return { acme: acme.id, globex: globex.id }
    })
  )
}

const programmeNames = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ readonly name: string }>`SELECT name FROM programmes.programmes ORDER BY name`
  return rows.map((row) => row.name)
})

layer(Fixtures.layer.pipe(Layer.provideMerge(TestDatabase.layer)), { timeout: "60 seconds" })("tenancy", (it) => {
  describe("roles and policies (ADR-0012)", () => {
    it.effect("leave no table unprotected and no runtime role able to bypass RLS", () =>
      Effect.gen(function*() {
        const { owner } = yield* TestDatabase
        const violations = yield* findRlsViolations.pipe(Effect.provideService(SqlClient.SqlClient, owner))
        expect(violations).toEqual([])
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
        const sql = yield* SqlClient.SqlClient
        yield* withTenant({ organisationId: acme, role: "mq_ctx_programmes" })(programmeNames)
        const [state] = yield* sql<{ readonly role: string; readonly tenant: string | null }>`
          SELECT current_user AS role, NULLIF(current_setting('app.organisation_id', true), '') AS tenant`
        expect(state).toEqual({ role: "mq_app", tenant: null })
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

  describe("SystemSql (ADR-0013)", () => {
    it.effect("reads across tenants", () =>
      Effect.gen(function*() {
        const system = yield* SystemSql
        const rows = yield* system<{ readonly name: string }>`SELECT name FROM programmes.programmes ORDER BY name`
        expect(rows.map((row) => row.name)).toEqual(["Acme Leadership", "Globex Finance"])
      }))
  })
})
