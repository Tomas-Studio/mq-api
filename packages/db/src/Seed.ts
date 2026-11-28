import { Email, OrganisationId, PersonId, ProgrammeId } from "@mequest/contract"
import { Data, Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

// Seeds a local or development database so a person can sign in and see data:
// the "demo" organisation, one programme, and the given person as the
// organisation's owner and the programme's instructor. Running it again
// changes nothing. Every row it creates or finds is logged with its id, since
// there is no audit log yet.
//
// It inserts past row-level security, so it refuses to run as a role that does
// not bypass RLS (the local `postgres` superuser does). `bun run db:seed` runs
// it as the migrator.

/** Who the seed makes owner and instructor, as read from SEED_EMAIL and SEED_NAME. */
export interface SeedPerson {
  readonly email: string
  readonly name: string
}

/** One seeded row: its id, and whether this run created it. */
export interface Seeded<Id> {
  readonly id: Id
  readonly created: boolean
}

export interface SeedResult {
  readonly organisation: Seeded<OrganisationId>
  readonly programme: Seeded<ProgrammeId>
  readonly person: Seeded<PersonId>
}

/** SEED_EMAIL or SEED_NAME is missing, still a placeholder, or not valid. */
export class InvalidSeedInput extends Data.TaggedError("InvalidSeedInput")<{
  readonly variable: "SEED_EMAIL" | "SEED_NAME"
  readonly message: string
}> {}

/** The connected role is subject to row-level security, so the inserts would fail. */
export class RlsNotBypassed extends Data.TaggedError("RlsNotBypassed")<{
  readonly role: string
  readonly message: string
}> {}

export const demoOrganisation = { slug: "demo", name: "Demo Academy" } as const
export const demoProgramme = "Demo Programme"

/** A value copied from .env.example or .env.local and never filled in, like `<your email>`. */
const isPlaceholder = (value: string) => /^<.*>$/.test(value.trim())

const validEmail = Effect.fn("seed.validEmail")(function*(value: string) {
  if (isPlaceholder(value)) {
    return yield* new InvalidSeedInput({
      variable: "SEED_EMAIL",
      message: "SEED_EMAIL still holds a placeholder; set it in .env.local to the email you will sign in with"
    })
  }
  return yield* Schema.decodeUnknownEffect(Email)(value).pipe(
    Effect.mapError(() =>
      new InvalidSeedInput({
        variable: "SEED_EMAIL",
        message: "SEED_EMAIL is not an email address; set it in .env.local, for example you@example.com"
      })
    )
  )
})

const validName = Effect.fn("seed.validName")(function*(value: string) {
  const name = value.trim()
  if (name === "" || isPlaceholder(name)) {
    return yield* new InvalidSeedInput({
      variable: "SEED_NAME",
      message: "SEED_NAME is empty or still holds a placeholder; set it in .env.local or remove it"
    })
  }
  return name
})

const Created = Schema.Struct({ created: Schema.Boolean })

const makeQueries = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  const connectedRole = SqlSchema.findOne({
    Request: Schema.Void,
    Result: Schema.Struct({ role: Schema.String, bypassesRls: Schema.Boolean }),
    execute: () =>
      sql`SELECT current_user AS role, rolsuper OR rolbypassrls AS "bypassesRls" FROM pg_roles WHERE rolname = current_user`
  })

  const upsertOrganisation = SqlSchema.findOne({
    Request: Schema.Void,
    Result: Schema.Struct({ id: OrganisationId, ...Created.fields }),
    execute: () =>
      sql`
        WITH inserted AS (
          INSERT INTO org.organisations (slug, name) VALUES (${demoOrganisation.slug}, ${demoOrganisation.name})
          ON CONFLICT (slug) DO NOTHING
          RETURNING id
        )
        SELECT id, true AS created FROM inserted
        UNION ALL
        SELECT id, false FROM org.organisations
        WHERE slug = ${demoOrganisation.slug} AND NOT EXISTS (SELECT FROM inserted)`
  })

  const upsertPerson = SqlSchema.findOne({
    Request: Schema.Struct({ email: Schema.String, name: Schema.String }),
    Result: Schema.Struct({ id: PersonId, ...Created.fields }),
    execute: ({ email, name }) =>
      sql`
        WITH inserted AS (
          INSERT INTO identity.people (email, name) VALUES (${email}, ${name})
          ON CONFLICT (email) DO NOTHING
          RETURNING id
        )
        SELECT id, true AS created FROM inserted
        UNION ALL
        SELECT id, false FROM identity.people WHERE email = ${email} AND NOT EXISTS (SELECT FROM inserted)`
  })

  const findProgramme = SqlSchema.findOneOption({
    Request: OrganisationId,
    Result: Schema.Struct({ id: ProgrammeId }),
    execute: (organisationId) =>
      sql`
        SELECT id FROM programmes.programmes
        WHERE organisation_id = ${organisationId} AND name = ${demoProgramme}
        ORDER BY id LIMIT 1`
  })

  const insertProgramme = SqlSchema.findOne({
    Request: OrganisationId,
    Result: Schema.Struct({ id: ProgrammeId }),
    execute: (organisationId) =>
      sql`INSERT INTO programmes.programmes (organisation_id, name) VALUES (${organisationId}, ${demoProgramme}) RETURNING id`
  })

  const grantRoles = (organisationId: OrganisationId, programmeId: ProgrammeId, personId: PersonId) =>
    Effect.andThen(
      sql`
        INSERT INTO access.org_memberships (organisation_id, person_id, role)
        VALUES (${organisationId}, ${personId}, 'owner')
        ON CONFLICT (organisation_id, person_id) DO NOTHING`,
      sql`
        INSERT INTO access.programme_roles (organisation_id, programme_id, person_id, role)
        VALUES (${organisationId}, ${programmeId}, ${personId}, 'instructor')
        ON CONFLICT (programme_id, person_id, role) DO NOTHING`
    )

  return { sql, connectedRole, upsertOrganisation, upsertPerson, findProgramme, insertProgramme, grantRoles } as const
})

/**
 * Seeds the demo organisation for `person` in one transaction. Validates the
 * input before it touches the database, and logs every id it creates or finds.
 */
export const seedDemo = Effect.fn("seed.demo")(function*(person: SeedPerson) {
  const email = yield* validEmail(person.email)
  const name = yield* validName(person.name)
  const queries = yield* makeQueries

  const ensureBypassesRls = Effect.fn("seed.ensureBypassesRls")(function*() {
    const { role, bypassesRls } = yield* queries.connectedRole()
    if (!bypassesRls) {
      return yield* new RlsNotBypassed({
        role,
        message: `${role} is subject to row-level security; run the seed as the local postgres superuser`
      })
    }
  })

  const ensureProgramme = Effect.fn("seed.ensureProgramme")(function*(organisationId: OrganisationId) {
    const existing = yield* queries.findProgramme(organisationId)
    if (existing._tag === "Some") return { id: existing.value.id, created: false }
    const { id } = yield* queries.insertProgramme(organisationId)
    return { id, created: true }
  })

  const seeded = Effect.gen(function*() {
    yield* ensureBypassesRls()
    const organisation = yield* Effect.withSpan(queries.upsertOrganisation(), "seed.upsertOrganisation")
    const seededPerson = yield* Effect.withSpan(queries.upsertPerson({ email, name }), "seed.upsertPerson")
    const programme = yield* ensureProgramme(organisation.id)
    yield* Effect.withSpan(queries.grantRoles(organisation.id, programme.id, seededPerson.id), "seed.grantRoles")
    const result: SeedResult = { organisation, programme, person: seededPerson }
    return result
  })

  const result = yield* queries.sql.withTransaction(seeded)

  yield* Effect.logInfo("Seeded the demo organisation").pipe(Effect.annotateLogs({
    organisationId: result.organisation.id,
    organisationCreated: result.organisation.created,
    programmeId: result.programme.id,
    programmeCreated: result.programme.created,
    personId: result.person.id,
    personCreated: result.person.created,
    organisationRole: "owner",
    programmeRole: "instructor"
  }))
  return result
})
