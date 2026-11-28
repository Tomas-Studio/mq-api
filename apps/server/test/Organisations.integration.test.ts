import { assert, describe, expect, layer } from "@effect/vitest"
import type { OrganisationId, PersonId, ProgrammeId } from "@mequest/contract"
import { TestDatabase } from "@mequest/db/testing"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest } from "effect/http"
import { newPerson, signedInApi, signInWithBearer } from "./Sessions.ts"
import { fromNewAddress, TestServer } from "./TestServer.ts"

// Each test builds the organisations it needs, written as the schema owner.

let organisations = 0

const newOrganisation = Effect.fn(function*(name: string) {
  const { owner } = yield* TestDatabase
  organisations += 1
  const slug = `${name.toLowerCase().replaceAll(" ", "-")}-${organisations}`
  const [row] = yield* owner<{ readonly id: OrganisationId }>`
    INSERT INTO org.organisations (slug, name) VALUES (${slug}, ${name}) RETURNING id`
  assert(row !== undefined)
  return { id: row.id, slug, name }
})

const newProgramme = Effect.fn(function*(organisationId: OrganisationId, name: string) {
  const { owner } = yield* TestDatabase
  const [row] = yield* owner<{ readonly id: ProgrammeId }>`
    INSERT INTO programmes.programmes (organisation_id, name) VALUES (${organisationId}, ${name}) RETURNING id`
  assert(row !== undefined)
  return { id: row.id, name }
})

const addMember = Effect.fn(function*(organisationId: OrganisationId, personId: PersonId, role: string) {
  const { owner } = yield* TestDatabase
  yield* owner`
    INSERT INTO access.org_memberships (organisation_id, person_id, role)
    VALUES (${organisationId}, ${personId}, ${role})`
})

const removeMember = Effect.fn(function*(organisationId: OrganisationId, personId: PersonId) {
  const { owner } = yield* TestDatabase
  yield* owner`
    DELETE FROM access.org_memberships WHERE organisation_id = ${organisationId} AND person_id = ${personId}`
})

const giveProgrammeRole = Effect.fn(
  function*(organisationId: OrganisationId, programmeId: ProgrammeId, personId: PersonId, role: string) {
    const { owner } = yield* TestDatabase
    yield* owner`
      INSERT INTO access.programme_roles (organisation_id, programme_id, person_id, role)
      VALUES (${organisationId}, ${programmeId}, ${personId}, ${role})`
  }
)

/** A GET without the generated client, for responses it cannot express. */
const rawGet = Effect.fn(function*(path: string, token?: string) {
  const request = fromNewAddress(HttpClientRequest.get(path))
  const response = yield* HttpClient.execute(
    token === undefined ? request : HttpClientRequest.bearerToken(request, token)
  )
  return { status: response.status, body: yield* response.json }
})

const unknownOrganisation = "00000000000040008000000000000000"

/** The hyphenated spelling of an id, which the API does not accept (ADR-0032). */
const hyphenate = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`

layer(TestServer, { timeout: "60 seconds" })("organisations and programmes", (it) => {
  describe("my organisations", () => {
    it.effect("lists each organisation the person belongs to, with their organisation role", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        const globex = yield* newOrganisation("Globex Institute")
        yield* newOrganisation("Initech College")
        const finance = yield* newProgramme(globex.id, "Globex Finance")
        yield* addMember(acme.id, ada.id, "owner")
        yield* giveProgrammeRole(globex.id, finance.id, ada.id, "learner")

        const client = yield* signedInApi(ada.email)
        expect(yield* client.organisations.listMine()).toEqual([
          { organisation: acme, role: "owner" },
          { organisation: globex, role: null }
        ])
      }))

    it.effect("lists nothing for a person who belongs nowhere", () =>
      Effect.gen(function*() {
        const grace = yield* newPerson("Grace")
        const acme = yield* newOrganisation("Acme Academy")
        const someoneElse = yield* newPerson("Alan")
        yield* addMember(acme.id, someoneElse.id, "owner")

        const client = yield* signedInApi(grace.email)
        expect(yield* client.organisations.listMine()).toEqual([])
      }))

    it.effect("needs a session", () =>
      Effect.gen(function*() {
        expect((yield* rawGet("/api/me/organisations")).status).toBe(401)
      }))

    // ADR-0032: ids go over the wire as UUIDv7, 32 lowercase hex digits.
    it.effect("writes ids as 32 lowercase hex digits with no hyphens", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        yield* addMember(acme.id, ada.id, "owner")
        const token = yield* signInWithBearer(ada.email)

        const response = yield* rawGet("/api/me/organisations", token)
        expect(response).toEqual({
          status: 200,
          body: [{ organisation: { id: acme.id, slug: acme.slug, name: acme.name }, role: "owner" }]
        })
        expect(acme.id).toMatch(/^[0-9a-f]{12}7[0-9a-f]{19}$/)
      }))
  })

  // ADR-0030: the organisation comes from the path and is checked against the
  // person's memberships.
  describe("current organisation", () => {
    it.effect("returns the organisation to a member", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        yield* addMember(acme.id, ada.id, "member")

        const client = yield* signedInApi(ada.email)
        expect(yield* client.organisations.get({ params: { organisationId: acme.id } })).toEqual(acme)
      }))

    it.effect("returns it to a person whose only role is in one of its programmes", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        const leadership = yield* newProgramme(acme.id, "Acme Leadership")
        yield* giveProgrammeRole(acme.id, leadership.id, ada.id, "learner")

        const client = yield* signedInApi(ada.email)
        expect(yield* client.organisations.get({ params: { organisationId: acme.id } })).toEqual(acme)
      }))

    it.effect("answers 404 to a person who does not belong to it", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        const globex = yield* newOrganisation("Globex Institute")
        yield* addMember(acme.id, ada.id, "owner")

        const client = yield* signedInApi(ada.email)
        const error = yield* Effect.flip(client.organisations.get({ params: { organisationId: globex.id } }))
        expect(error).toMatchObject({ _tag: "OrganisationNotFound" })
      }))

    it.effect("answers 404 for an organisation that does not exist", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const token = yield* signInWithBearer(ada.email)
        const response = yield* rawGet(`/api/organisations/${unknownOrganisation}`, token)
        expect(response).toEqual({ status: 404, body: { _tag: "OrganisationNotFound" } })
      }))

    it.effect("answers 404 for a malformed organisation id", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const token = yield* signInWithBearer(ada.email)
        const response = yield* rawGet("/api/organisations/not-an-id", token)
        expect(response).toEqual({ status: 404, body: { _tag: "OrganisationNotFound" } })
      }))

    it.effect("answers 404 for a member's organisation id written with hyphens or in capitals", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        yield* addMember(acme.id, ada.id, "owner")
        const token = yield* signInWithBearer(ada.email)

        expect((yield* rawGet(`/api/organisations/${acme.id}`, token)).status).toBe(200)
        for (const spelling of [hyphenate(acme.id), acme.id.toUpperCase()]) {
          const response = yield* rawGet(`/api/organisations/${spelling}`, token)
          expect(response).toEqual({ status: 404, body: { _tag: "OrganisationNotFound" } })
        }
      }))

    it.effect("stops answering on the next request once the membership is removed", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        yield* addMember(acme.id, ada.id, "member")
        const client = yield* signedInApi(ada.email)
        yield* client.organisations.get({ params: { organisationId: acme.id } })

        yield* removeMember(acme.id, ada.id)
        const error = yield* Effect.flip(client.organisations.get({ params: { organisationId: acme.id } }))
        expect(error).toMatchObject({ _tag: "OrganisationNotFound" })
      }))

    it.effect("asks for a session before it looks at the organisation", () =>
      Effect.gen(function*() {
        const acme = yield* newOrganisation("Acme Academy")
        expect((yield* rawGet(`/api/organisations/${acme.id}`)).status).toBe(401)
        expect((yield* rawGet(`/api/organisations/${unknownOrganisation}`)).status).toBe(401)
      }))
  })

  describe("my programmes", () => {
    it.effect("lists the programmes the person has a role in, with their roles", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        const leadership = yield* newProgramme(acme.id, "Acme Leadership")
        const finance = yield* newProgramme(acme.id, "Acme Finance")
        yield* newProgramme(acme.id, "Acme Sales")
        yield* giveProgrammeRole(acme.id, leadership.id, ada.id, "reviewer")
        yield* giveProgrammeRole(acme.id, leadership.id, ada.id, "instructor")
        yield* giveProgrammeRole(acme.id, finance.id, ada.id, "learner")

        const client = yield* signedInApi(ada.email)
        expect(yield* client.programmes.listMine({ params: { organisationId: acme.id } })).toEqual([
          { programme: finance, roles: ["learner"] },
          { programme: leadership, roles: ["instructor", "reviewer"] }
        ])
      }))

    it.effect("lists only the current organisation's programmes", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        const globex = yield* newOrganisation("Globex Institute")
        const leadership = yield* newProgramme(acme.id, "Acme Leadership")
        const finance = yield* newProgramme(globex.id, "Globex Finance")
        yield* giveProgrammeRole(acme.id, leadership.id, ada.id, "learner")
        yield* giveProgrammeRole(globex.id, finance.id, ada.id, "learner")

        const client = yield* signedInApi(ada.email)
        expect(yield* client.programmes.listMine({ params: { organisationId: acme.id } })).toEqual([
          { programme: leadership, roles: ["learner"] }
        ])
      }))

    it.effect("lists nothing for a member with no programme roles", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        const leadership = yield* newProgramme(acme.id, "Acme Leadership")
        const someoneElse = yield* newPerson("Alan")
        yield* addMember(acme.id, ada.id, "billing")
        yield* giveProgrammeRole(acme.id, leadership.id, someoneElse.id, "learner")

        const client = yield* signedInApi(ada.email)
        expect(yield* client.programmes.listMine({ params: { organisationId: acme.id } })).toEqual([])
      }))

    it.effect("answers 404 to a person who does not belong to the organisation", () =>
      Effect.gen(function*() {
        const ada = yield* newPerson("Ada")
        const acme = yield* newOrganisation("Acme Academy")
        yield* newProgramme(acme.id, "Acme Leadership")

        const client = yield* signedInApi(ada.email)
        const error = yield* Effect.flip(client.programmes.listMine({ params: { organisationId: acme.id } }))
        expect(error).toMatchObject({ _tag: "OrganisationNotFound" })
      }))
  })
})
