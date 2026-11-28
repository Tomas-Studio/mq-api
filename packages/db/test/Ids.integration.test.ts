import { assert, describe, expect, layer } from "@effect/vitest"
import type { OrganisationId } from "@mequest/contract"
import { Effect } from "effect"
import { SqlClient } from "effect/sql"
import { SystemSql, withTenant } from "../src/index.ts"
import { TestDatabase } from "../src/testing/index.ts"

// ADR-0032: new rows get UUIDv7 ids, and every client reads ids as 32
// lowercase hex digits.

const hyphenFree = /^[0-9a-f]{32}$/
/** Version nibble 7 and the RFC 9562 variant (8, 9, a or b). */
const version7 = /^[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/

const hyphenate = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`

const insertOrganisation = Effect.fn(function*(slug: string) {
  const { owner } = yield* TestDatabase
  const [row] = yield* owner<{ readonly id: OrganisationId }>`
    INSERT INTO org.organisations (slug, name) VALUES (${slug}, ${slug}) RETURNING id`
  assert(row !== undefined)
  return row.id
})

/** The organisations the current scope can see, as the app client reads them. */
const visibleOrganisations = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<{ readonly id: string; readonly slug: string }>`SELECT id, slug FROM org.organisations`
})

layer(TestDatabase.layer, { timeout: "60 seconds" })("ids", (it) => {
  describe("new rows", () => {
    it.effect("get UUIDv7 ids in every table with a generated id", () =>
      Effect.gen(function*() {
        const { owner } = yield* TestDatabase
        const organisation = yield* insertOrganisation("v7-everywhere")
        const [programme] = yield* owner<{ readonly id: string }>`
          INSERT INTO programmes.programmes (organisation_id, name)
          VALUES (${organisation}, 'Leadership') RETURNING id`
        const [person] = yield* owner<{ readonly id: string }>`
          INSERT INTO identity.people (email, name) VALUES ('v7@example.com', 'Vee') RETURNING id`
        assert(programme !== undefined && person !== undefined)
        const [session] = yield* owner<{ readonly id: string }>`
          INSERT INTO identity.sessions (person_id, token_hash, created_at, expires_at)
          VALUES (${person.id}, 'v7-token-hash', now(), now() + interval '1 day') RETURNING id`
        assert(session !== undefined)

        for (const id of [organisation, programme.id, person.id, session.id]) {
          expect(id).toMatch(version7)
        }
      }))

    it.effect("sort by creation", () =>
      Effect.gen(function*() {
        const first = yield* insertOrganisation("sorted-1")
        const second = yield* insertOrganisation("sorted-2")
        const third = yield* insertOrganisation("sorted-3")
        expect([third, first, second].toSorted()).toEqual([first, second, third])
      }))

    it.effect("default to uuidv7() wherever a uuid column has a default", () =>
      Effect.gen(function*() {
        const { owner } = yield* TestDatabase
        const others = yield* owner<{ readonly columnName: string; readonly columnDefault: string }>`
          SELECT
            table_schema || '.' || table_name || '.' || column_name AS "columnName",
            column_default AS "columnDefault"
          FROM information_schema.columns
          WHERE data_type = 'uuid'
            AND column_default IS NOT NULL
            AND table_schema NOT IN ('pg_catalog', 'information_schema')
            AND column_default <> 'uuidv7()'`
        expect(others).toEqual([])
      }))
  })

  describe("reading", () => {
    it.effect("the app client reads uuids, and arrays of them, without hyphens", () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const [row] = yield* sql<{ readonly id: string; readonly ids: ReadonlyArray<string> }>`
          SELECT uuidv7() AS id, ARRAY[uuidv7(), uuidv7()] AS ids`
        assert(row !== undefined)
        expect(row.id).toMatch(hyphenFree)
        expect(row.ids).toHaveLength(2)
        for (const id of row.ids) expect(id).toMatch(hyphenFree)
      }))

    it.effect("SystemSql reads them without hyphens too", () =>
      Effect.gen(function*() {
        const system = yield* SystemSql
        const [row] = yield* system<{ readonly id: string }>`SELECT uuidv7() AS id`
        assert(row !== undefined)
        expect(row.id).toMatch(hyphenFree)
      }))
  })

  describe("parameters", () => {
    it.effect("a hyphen-free id finds its row, and so does the hyphenated form", () =>
      Effect.gen(function*() {
        const { owner } = yield* TestDatabase
        const id = yield* insertOrganisation("lookup")
        const byHyphenFree = yield* owner<{ readonly slug: string }>`
          SELECT slug FROM org.organisations WHERE id = ${id}`
        const byHyphenated = yield* owner<{ readonly slug: string }>`
          SELECT slug FROM org.organisations WHERE id = ${hyphenate(id)}`
        expect(byHyphenFree).toEqual([{ slug: "lookup" }])
        expect(byHyphenated).toEqual([{ slug: "lookup" }])
      }))

    it.effect("a hyphen-free id scopes row-level security to its organisation", () =>
      Effect.gen(function*() {
        const id = yield* insertOrganisation("tenant-scope")
        yield* insertOrganisation("another-tenant")
        const visible = yield* withTenant({ organisationId: id, role: "mq_ctx_org" })(visibleOrganisations)
        expect(visible).toEqual([{ id, slug: "tenant-scope" }])
      }))
  })
})
