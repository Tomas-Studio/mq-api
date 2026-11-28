import { assert, describe, expect, layer } from "@effect/vitest"
import { Effect, Logger } from "effect"
import { SqlClient } from "effect/sql"
import { demoOrganisation, demoProgramme, seedDemo, type SeedPerson } from "../src/Seed.ts"
import { TestDatabase } from "../src/testing/index.ts"

// `bun run db:seed` (see Seed.ts): development tooling, so tier 3 (ADR-0033).
// These cover what would mislead or write bad data: rerunning, unfilled
// placeholders, and a role that RLS applies to. The seed runs as the schema
// owner, as the migrator does locally; each group gets a database clone of its
// own because the demo organisation's slug is fixed.

const ada: SeedPerson = { email: "  Ada@Example.COM ", name: " Ada Lovelace " }
const version7 = /^[0-9a-f]{12}7[0-9a-f]{19}$/

/** Runs the seed as the schema owner and collects what it logs. */
const seedAsOwner = Effect.fn(function*(person: SeedPerson) {
  const { owner } = yield* TestDatabase
  const logs: Array<{ readonly message: unknown; readonly annotations: Record<string, unknown> }> = []
  const logger = Logger.formatStructured.pipe(Logger.map((entry) => {
    logs.push(entry)
  }))
  const result = yield* seedDemo(person).pipe(
    Effect.provideService(SqlClient.SqlClient, owner),
    Effect.provide(Logger.layer([logger]))
  )
  return { result, logs }
})

/** Every row the seed could have written, read as the schema owner. */
const seededRows = Effect.gen(function*() {
  const { owner } = yield* TestDatabase
  const organisations = yield* owner<{ readonly id: string; readonly slug: string; readonly name: string }>`
    SELECT id, slug, name FROM org.organisations`
  const programmes = yield* owner<{ readonly id: string; readonly organisationId: string; readonly name: string }>`
    SELECT id, organisation_id AS "organisationId", name FROM programmes.programmes`
  const people = yield* owner<{ readonly id: string; readonly email: string; readonly name: string }>`
    SELECT id, email, name FROM identity.people`
  const memberships = yield* owner<
    { readonly organisationId: string; readonly personId: string; readonly role: string }
  >`
    SELECT organisation_id AS "organisationId", person_id AS "personId", role FROM access.org_memberships`
  const programmeRoles = yield* owner<
    { readonly programmeId: string; readonly personId: string; readonly role: string }
  >`
    SELECT programme_id AS "programmeId", person_id AS "personId", role FROM access.programme_roles`
  return { organisations, programmes, people, memberships, programmeRoles }
})

const nothingSeeded = { organisations: [], programmes: [], people: [], memberships: [], programmeRoles: [] }

layer(TestDatabase.layer, { timeout: "60 seconds" })("seeding an empty database", (it) => {
  it.effect("creates the demo organisation and programme, with the person as owner and instructor", () =>
    Effect.gen(function*() {
      const { result } = yield* seedAsOwner(ada)
      const { organisation, programme, person } = result

      expect([organisation.created, programme.created, person.created]).toEqual([true, true, true])
      for (const { id } of [organisation, programme, person]) expect(id).toMatch(version7)
      expect(yield* seededRows).toEqual({
        organisations: [{ id: organisation.id, ...demoOrganisation }],
        programmes: [{ id: programme.id, organisationId: organisation.id, name: demoProgramme }],
        people: [{ id: person.id, email: "ada@example.com", name: "Ada Lovelace" }],
        memberships: [{ organisationId: organisation.id, personId: person.id, role: "owner" }],
        programmeRoles: [{ programmeId: programme.id, personId: person.id, role: "instructor" }]
      })
    }))

  it.effect("changes nothing when it runs again, and logs every id it found", () =>
    Effect.gen(function*() {
      const before = yield* seededRows
      const { result, logs } = yield* seedAsOwner(ada)

      expect(yield* seededRows).toEqual(before)
      const [organisation] = before.organisations
      assert(organisation !== undefined)
      expect(result.organisation).toEqual({ id: organisation.id, created: false })
      // The log line is the audit trail until the audit context exists.
      expect(logs).toHaveLength(1)
      expect(logs[0]).toMatchObject({
        message: "Seeded the demo organisation",
        annotations: {
          organisationId: result.organisation.id,
          organisationCreated: false,
          programmeId: result.programme.id,
          programmeCreated: false,
          personId: result.person.id,
          personCreated: false,
          organisationRole: "owner",
          programmeRole: "instructor"
        }
      })
    }))
})

layer(TestDatabase.layer, { timeout: "60 seconds" })("seeding with bad input", (it) => {
  describe("names the variable to fix and writes nothing", () => {
    it.effect.each(
      [
        ["an unfilled email placeholder", { email: "<your email>", name: "Ada" }, "SEED_EMAIL"],
        ["an unfilled name placeholder", { email: "ada@example.com", name: "<your name>" }, "SEED_NAME"]
      ] as const
    )("%s", ([, person, variable]) =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(seedAsOwner(person))
        expect(error).toMatchObject({ _tag: "InvalidSeedInput", variable })
        expect(error.message).toContain(variable)
        expect(yield* seededRows).toEqual(nothingSeeded)
      }))
  })
})

layer(TestDatabase.layer, { timeout: "60 seconds" })("seeding as a role subject to RLS", (it) => {
  it.effect("refuses before writing anything", () =>
    Effect.gen(function*() {
      // The layer's SqlClient is mq_app, as the server connects.
      const error = yield* Effect.flip(seedDemo(ada))
      expect(error).toMatchObject({ _tag: "RlsNotBypassed", role: "mq_app" })
      expect(yield* seededRows).toEqual(nothingSeeded)
    }))
})
