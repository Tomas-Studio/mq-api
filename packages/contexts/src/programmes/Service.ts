import type { MyProgramme, OrganisationId, PersonId } from "@mequest/contract"
import { withTenant } from "@mequest/db"
import { Array, Context, Effect, Layer } from "effect"
import { SqlClient } from "effect/sql"
import { Access } from "../access/index.ts"
import { makeRepo } from "./Repo.ts"

/** Programmes (legacy cohorts) and the signed-in person's view of them. */
export class Programmes extends Context.Service<Programmes>()("mq/Programmes", {
  make: Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* makeRepo
    const access = yield* Access

    // Database failures are defects: callers only ever see declared errors.
    const inOrganisation = (organisationId: OrganisationId) => <A, E>(self: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      withTenant({ organisationId, role: "mq_ctx_programmes" })(self).pipe(
        Effect.provideService(SqlClient.SqlClient, sql),
        Effect.orDie
      )

    /** The programmes the person holds a role in, sorted by name, each with the roles sorted. */
    const listMine = Effect.fn("Programmes.listMine")(
      function*(organisationId: OrganisationId, personId: PersonId): Effect.fn.Return<ReadonlyArray<MyProgramme>> {
        const roles = yield* access.programmeRolesOf(organisationId, personId)
        const ids = Array.dedupe(roles.map((role) => role.programmeId))
        if (!Array.isArrayNonEmpty(ids)) return []
        const programmes = yield* inOrganisation(organisationId)(repo.findByIds(ids))
        return programmes.map((programme) => ({
          programme,
          roles: roles.filter((role) => role.programmeId === programme.id).map((role) => role.role)
        }))
      }
    )

    return { listMine } as const
  })
}) {
  static readonly layer = Layer.effect(Programmes, Programmes.make)
}
