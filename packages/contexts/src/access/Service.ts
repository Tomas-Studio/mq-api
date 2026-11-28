import type { OrganisationId, OrganisationRole, PersonId, ProgrammeId, ProgrammeRole } from "@mequest/contract"
import { withPerson, withTenant } from "@mequest/db"
import { Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { makeRepo } from "./Repo.ts"

export interface OrganisationOfPerson {
  readonly organisationId: OrganisationId
  /** Null when the person belongs only through programme roles. */
  readonly role: OrganisationRole | null
}

export interface ProgrammeRoleOfPerson {
  readonly programmeId: ProgrammeId
  readonly role: ProgrammeRole
}

/** Who belongs to which organisation, and their programme roles (ADR-0014). */
export class Access extends Context.Service<Access>()("mq/Access", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* makeRepo

    // Database failures are defects: callers only ever see declared errors.
    const asPerson = (personId: PersonId) => <A, E>(self: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      withPerson({ personId, role: "mq_ctx_access" })(self).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie
      )

    const inOrganisation = (organisationId: OrganisationId) => <A, E>(self: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      withTenant({ organisationId, role: "mq_ctx_access" })(self).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie
      )

    /** Every organisation the person belongs to, read in a person scope (ADR-0031). */
    const organisationsOf = Effect.fn("Access.organisationsOf")(
      function*(personId: PersonId): Effect.fn.Return<ReadonlyArray<OrganisationOfPerson>> {
        return yield* asPerson(personId)(repo.organisationsOf(personId))
      }
    )

    /** A member has an organisation membership or a role in one of its programmes (ADR-0030). */
    const isMember = Effect.fn("Access.isMember")(function*(organisationId: OrganisationId, personId: PersonId) {
      const { member } = yield* inOrganisation(organisationId)(repo.isMember({ organisationId, personId }))
      return member
    })

    const programmeRolesOf = Effect.fn("Access.programmeRolesOf")(
      function*(
        organisationId: OrganisationId,
        personId: PersonId
      ): Effect.fn.Return<ReadonlyArray<ProgrammeRoleOfPerson>> {
        return yield* inOrganisation(organisationId)(repo.programmeRolesOf({ organisationId, personId }))
      }
    )

    return { organisationsOf, isMember, programmeRolesOf } as const
  })
}) {
  static readonly layer = Layer.effect(Access, Access.make)
}
